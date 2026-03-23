const express = require('express');
const pool = require('../db/pool');
const { trainerizePostRaw, invalidateCacheForClient } = require('../lib/trainerize');
const { upsertBodyStat, upsertWorkout, upsertCardio } = require('../lib/trainerize-store');

const router = express.Router();

const COACH_ID = 1; // Single coach for now

async function trainerizeFindByEmail(email) {
  const data = await trainerizePostRaw('/user/find', {
    searchTerm: email,
    view: 'allClient',
    start: 0,
    count: 5,
  });
  const users = data.users || [];
  return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase()) || null;
}

// Map Typeform form IDs to check-in types
const FORM_TYPE_MAP = {
  'n3gubYfj': 'weekly',      // Weekly Check-in (Executive Check-in)
  'iISVFuRv': 'eom_report',  // End of Month Report
};

const MATCH_THRESHOLD = 0.8; // 80% similarity required

// --- Fuzzy matching utilities ---

// Strip accents/fadas, remove apostrophes and punctuation, lowercase
function normalise(name) {
  return name
    .normalize('NFD')                    // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')     // strip combining diacritics
    .replace(/[''`]/g, '')               // strip apostrophes
    .replace(/[^a-zA-Z0-9\s]/g, '')     // strip remaining punctuation
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');              // collapse multiple spaces
}

// Levenshtein distance (Wagner-Fischer)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Similarity ratio: 0.0 to 1.0
function similarity(a, b) {
  const normA = normalise(a);
  const normB = normalise(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(normA, normB) / maxLen;
}

// Find best matching client from a list
function findBestMatch(submittedName, clients) {
  let bestMatch = null;
  let bestScore = 0;

  for (const client of clients) {
    const score = similarity(submittedName, client.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = client;
    }
  }

  return { match: bestMatch, score: bestScore };
}

const { getCurrentCycleSunday, getCurrentMonthFirst } = require('../lib/cycle');

// POST /webhooks/typeform
router.post('/typeform', async (req, res) => {
  // Always return 200 so Typeform doesn't retry
  try {
    const payload = req.body;
    const formResponse = payload.form_response;

    if (!formResponse) {
      console.warn('[Typeform webhook] No form_response in payload');
      return res.status(200).json({ ok: true, skipped: 'no form_response' });
    }

    // 1. Determine check-in type from form ID
    const formId = formResponse.form_id;
    const type = FORM_TYPE_MAP[formId];

    if (!type) {
      console.warn(`[Typeform webhook] Unknown form_id: ${formId}`);
      return res.status(200).json({ ok: true, skipped: 'unknown form_id' });
    }

    // 2. Extract response ID for dedup
    const responseId = formResponse.token;

    if (!responseId) {
      console.warn('[Typeform webhook] No token (response ID) in payload');
      return res.status(200).json({ ok: true, skipped: 'no response token' });
    }

    // 3. Extract client name from the first text answer
    const answers = formResponse.answers || [];
    const nameAnswer = answers.find(
      (a) => a.type === 'text' && a.field && a.field.type === 'short_text'
    ) || answers.find((a) => a.type === 'text');

    const clientName = nameAnswer ? nameAnswer.text.trim() : null;

    if (!clientName) {
      console.warn('[Typeform webhook] Could not extract client name from answers');
      return res.status(200).json({ ok: true, skipped: 'no client name' });
    }

    // 4. Fuzzy match client name against all active clients
    const allClients = await pool.query(
      `SELECT id, name FROM clients WHERE coach_id = $1 AND active = true`,
      [COACH_ID]
    );

    const { match, score } = findBestMatch(clientName, allClients.rows);

    if (!match || score < MATCH_THRESHOLD) {
      console.warn(
        `[Typeform webhook] UNMATCHED SUBMISSION — name: "${clientName}", ` +
        `best match: "${match ? match.name : 'none'}" (${(score * 100).toFixed(1)}%), ` +
        `threshold: ${MATCH_THRESHOLD * 100}%, response_id: ${responseId}`
      );
      return res.status(200).json({ ok: true, skipped: 'client not matched' });
    }

    console.log(
      `[Typeform webhook] Matched "${clientName}" → "${match.name}" (${(score * 100).toFixed(1)}%)`
    );

    const clientId = match.id;

    // 5. Calculate cycle_start (weekly = most recent Sunday, eom = 1st of month)
    const cycleStart = type === 'weekly'
      ? getCurrentCycleSunday()
      : getCurrentMonthFirst();

    // 6. Extract full answers for form_data storage
    const formDataJson = answers.length > 0 ? JSON.stringify(answers) : null;

    // 7. Insert check-in (dedup on typeform_response_id)
    const insertResult = await pool.query(
      `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, cycle_start, form_data)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7)
       ON CONFLICT (typeform_response_id) DO NOTHING
       RETURNING id`,
      [
        COACH_ID,
        clientId,
        type,
        responseId,
        formResponse.submitted_at || new Date().toISOString(),
        cycleStart,
        formDataJson,
      ]
    );

    if (insertResult.rows.length > 0) {
      console.log(`[Typeform webhook] Check-in created: id=${insertResult.rows[0].id}, client="${match.name}", type=${type}`);
    } else {
      console.log(`[Typeform webhook] Duplicate skipped: token=${responseId}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Typeform webhook] Error:', err.message);
    return res.status(200).json({ ok: true, error: 'internal' });
  }
});

// ============================================================
// Trainerize webhook dispatcher
// All Trainerize events arrive at a single URL: POST /webhooks/trainerize
// The event type is identified by the `type` field in the payload body.
// ============================================================

// --- Event handlers ---

async function handleClientAdded(payload) {
  const { firstname, lastname, email } = payload;

  if (!email) {
    console.warn('[Trainerize client.added] No email in payload');
    return { skipped: 'no email' };
  }

  const name = `${(firstname || '').trim()} ${(lastname || '').trim()}`.trim();
  if (!name) {
    console.warn('[Trainerize client.added] No name in payload');
    return { skipped: 'no name' };
  }

  // Dedup — skip if a client with this email already exists
  const existing = await pool.query(
    `SELECT id FROM clients WHERE email = $1 AND coach_id = $2`,
    [email.toLowerCase(), COACH_ID]
  );

  if (existing.rows.length > 0) {
    console.log(`[Trainerize client.added] Client already exists for ${email}, skipping`);
    return { skipped: 'already exists' };
  }

  // Look up the user in Trainerize API to get their userID
  let trainerizeId = null;
  try {
    const user = await trainerizeFindByEmail(email);
    if (user && user.id) {
      trainerizeId = String(user.id);
      console.log(`[Trainerize client.added] Found userID=${trainerizeId} for ${email}`);
    } else {
      console.warn(`[Trainerize client.added] Could not find userID for ${email} — will need manual entry`);
    }
  } catch (apiErr) {
    console.error(`[Trainerize client.added] API lookup failed: ${apiErr.message} — proceeding without userID`);
  }

  // Insert new client with pending_setup = true, program = null
  // trainerize_joined_at = now() since this is the moment they're being added
  const result = await pool.query(
    `INSERT INTO clients (coach_id, name, email, trainerize_id, program, pending_setup, active, trainerize_joined_at)
     VALUES ($1, $2, $3, $4, NULL, true, true, now())
     RETURNING id, name`,
    [COACH_ID, name, email.toLowerCase(), trainerizeId]
  );

  console.log(
    `[Trainerize client.added] Created client "${result.rows[0].name}" (id=${result.rows[0].id}, ` +
    `trainerize_id=${trainerizeId || 'unknown'}, pending_setup=true)`
  );
  return {};
}

async function handleClientStatusChanged(payload) {
  const { userID, status, firstname, lastname } = payload;

  if (!userID || !status) {
    console.warn('[Trainerize client.statusChanged] Missing userID or status');
    return { skipped: 'missing fields' };
  }

  const trainerizeId = String(userID);

  // "active" → true, "deactivated" → false, "pending" → ignore
  if (status === 'pending') {
    console.log(`[Trainerize client.statusChanged] Ignoring pending status for userID=${trainerizeId}`);
    return { skipped: 'pending status ignored' };
  }

  const active = status === 'active';

  const result = await pool.query(
    `UPDATE clients SET active = $1
     WHERE trainerize_id = $2 AND coach_id = $3
     RETURNING id, name, active`,
    [active, trainerizeId, COACH_ID]
  );

  if (result.rows.length === 0) {
    console.warn(
      `[Trainerize client.statusChanged] No matching client for userID=${trainerizeId} ` +
      `(${firstname || ''} ${lastname || ''})`
    );
    return { skipped: 'client not found' };
  }

  const client = result.rows[0];
  console.log(
    `[Trainerize client.statusChanged] Client "${client.name}" (id=${client.id}) → active=${active}`
  );
  return {};
}

function handlePing() {
  console.log('[Trainerize ping] Webhook connectivity verified');
  return {};
}

// Tag name → program value (same mapping used by import script)
const TAG_PROGRAM_MAP = {
  'Connor - MyFitCoach':      'my_fit_coach',
  'Connor - Core MyFitCoach': 'my_fit_coach_core',
};

async function handleUserTagAddedToUser(payload) {
  const { userID, userTagName } = payload;

  if (!userID || !userTagName) {
    console.warn('[Trainerize userTag.addedToUser] Missing userID or userTagName');
    return { skipped: 'missing fields' };
  }

  const program = TAG_PROGRAM_MAP[userTagName];
  if (!program) {
    console.log(`[Trainerize userTag.addedToUser] Ignoring unrelated tag "${userTagName}" for userID=${userID}`);
    return { skipped: 'unrelated tag' };
  }

  const trainerizeId = String(userID);
  const result = await pool.query(
    `UPDATE clients SET program = $1
     WHERE trainerize_id = $2 AND coach_id = $3
     RETURNING id, name, program`,
    [program, trainerizeId, COACH_ID]
  );

  if (result.rows.length === 0) {
    console.warn(`[Trainerize userTag.addedToUser] No matching client for userID=${trainerizeId}`);
    return { skipped: 'client not found' };
  }

  const client = result.rows[0];
  console.log(`[Trainerize userTag.addedToUser] Client "${client.name}" (id=${client.id}) → program=${program}`);
  return {};
}

async function handleUserTagRemovedFromUser(payload) {
  const { userID, userTagName } = payload;

  if (!userID || !userTagName) {
    console.warn('[Trainerize userTag.removedFromUser] Missing userID or userTagName');
    return { skipped: 'missing fields' };
  }

  const program = TAG_PROGRAM_MAP[userTagName];
  if (!program) {
    console.log(`[Trainerize userTag.removedFromUser] Ignoring unrelated tag "${userTagName}" for userID=${userID}`);
    return { skipped: 'unrelated tag' };
  }

  const trainerizeId = String(userID);

  // Only clear program if it currently matches the tag being removed
  const result = await pool.query(
    `UPDATE clients SET program = NULL
     WHERE trainerize_id = $1 AND coach_id = $2 AND program = $3
     RETURNING id, name`,
    [trainerizeId, COACH_ID, program]
  );

  if (result.rows.length === 0) {
    console.warn(`[Trainerize userTag.removedFromUser] No matching client (or program already different) for userID=${trainerizeId}`);
    return { skipped: 'client not found or program mismatch' };
  }

  const client = result.rows[0];
  console.log(`[Trainerize userTag.removedFromUser] Client "${client.name}" (id=${client.id}) → program cleared (was ${program})`);
  return {};
}

// --- Persistent storage handlers ---

async function handleBodystatsCompleted(payload) {
  const { userID, bodystats } = payload;
  if (!userID || !bodystats?.date) {
    console.warn('[Trainerize bodystats.completed] Missing userID or date');
    return { skipped: 'missing fields' };
  }

  try {
    await upsertBodyStat(userID, bodystats.date);
    console.log(`[Trainerize bodystats.completed] Stored for userID=${userID} on ${bodystats.date}`);
  } catch (err) {
    console.error(`[Trainerize bodystats.completed] Error: ${err.message}`);
  }
  return {};
}

async function handleDailyWorkoutCompleted(payload) {
  const { userID, dailyWorkoutID } = payload;
  if (!userID || !dailyWorkoutID) {
    console.warn('[Trainerize dailyWorkout.completed] Missing userID or dailyWorkoutID');
    return { skipped: 'missing fields' };
  }

  try {
    await upsertWorkout(userID, dailyWorkoutID);
    console.log(`[Trainerize dailyWorkout.completed] Stored workout ${dailyWorkoutID} for userID=${userID}`);
  } catch (err) {
    console.error(`[Trainerize dailyWorkout.completed] Error: ${err.message}`);
  }
  return {};
}

async function handleDailyCardioCompleted(payload) {
  const { userID, dailyWorkoutID } = payload;
  if (!userID || !dailyWorkoutID) {
    console.warn('[Trainerize dailyCardio.completed] Missing userID or dailyWorkoutID');
    return { skipped: 'missing fields' };
  }

  try {
    await upsertCardio(userID, dailyWorkoutID);
    console.log(`[Trainerize dailyCardio.completed] Stored cardio ${dailyWorkoutID} for userID=${userID}`);
  } catch (err) {
    console.error(`[Trainerize dailyCardio.completed] Error: ${err.message}`);
  }
  return {};
}

// --- Event type → handler map ---

const TRAINERIZE_HANDLERS = {
  // Active handlers
  'client.added':         handleClientAdded,
  'client.statusChanged': handleClientStatusChanged,
  'ping':                 handlePing,

  // Intentionally not handled — client.deleted must never affect portal data
  // 'client.deleted':    null,

  // Active handlers — persistent storage
  'dailyWorkout.completed': handleDailyWorkoutCompleted,
  'dailyCardio.completed':  handleDailyCardioCompleted,
  'bodystats.completed':    handleBodystatsCompleted,

  // Reserved for future use — client reassignment
  'client.assigned': null,

  // Reserved for future use — goals
  'goal.added':                  null,
  'goal.updated':                null,
  'goal.deleted':                null,
  'goal.hit':                    null,
  'goal.dailyNutrition.hit':     null,
  'goal.dailyNutrition.updated': null,

  // Reserved for future use — messaging
  'msg.received':            null,
  'msg.unreadCountChanged':  null,
  'group.mentioned':         null,

  // Reserved for future use — training & meal plans
  'trainingPlan.updated': null,
  'mealPlan.updated':     null,

  // Reserved for future use — habits
  'habit.added':              null,
  'habit.updated':            null,
  'habit.deleted':            null,
  'habit.dailyItem.completed': null,

  // Reserved for future use — add-on connections
  'addOn.fitbit.connected': null,
  'addOn.mfp.connected':    null,
  'addOn.nokia.connected':  null,
  'addOn.fb.connected':     null,

  // User tags — active handlers for program mapping
  'userTag.deleted':         null,
  'userTag.addedToUser':     handleUserTagAddedToUser,
  'userTag.removedFromUser': handleUserTagRemovedFromUser,

  // Reserved for future use — progress photos
  'progressPhoto.added': null,

  // Reserved for future use — payments
  'payment.newPurchase': null,
};

// --- Payload-shape inference (fallback if no `type` field) ---

function inferEventType(payload) {
  // client.added: has setupLink and no userID
  if (payload.setupLink !== undefined && !payload.userID) return 'client.added';
  // client.statusChanged: has userID + status + firstname (not a workout)
  if (payload.userID && payload.status && payload.firstname && !payload.dailyWorkoutID) return 'client.statusChanged';
  // client.deleted: has userID + firstname + email but no status
  if (payload.userID && payload.firstname && !payload.status) return 'client.deleted';
  // dailyWorkout.completed: has dailyWorkoutID + brokenRecords
  if (payload.dailyWorkoutID && payload.brokenRecords) return 'dailyWorkout.completed';
  // bodystats.completed: has bodystats object
  if (payload.bodystats) return 'bodystats.completed';
  // goal events: has goal object
  if (payload.goal) return 'goal.added'; // ambiguous — logged for review
  // msg.received: has threadID + messageID
  if (payload.threadID && payload.messageID) return 'msg.received';
  // trainingPlan.updated: has trainingPlan object
  if (payload.trainingPlan) return 'trainingPlan.updated';
  // mealPlan.updated: has mealPlan object
  if (payload.mealPlan) return 'mealPlan.updated';
  // habit events: has habit object
  if (payload.habit) return 'habit.added'; // ambiguous — logged for review
  // progressPhoto.added: has progressPhoto object
  if (payload.progressPhoto) return 'progressPhoto.added';
  // payment.newPurchase: has planName
  if (payload.planName) return 'payment.newPurchase';
  // userTag events: has userTagName
  if (payload.userTagName && payload.userID) return 'userTag.addedToUser'; // ambiguous add/remove — type field should be present
  if (payload.userTagName && !payload.userID) return 'userTag.deleted';
  // ping: empty or near-empty payload
  if (Object.keys(payload).length <= 1) return 'ping';

  return null;
}

// --- Single dispatcher route ---

router.post('/trainerize', async (req, res) => {
  // Always return 200 so Trainerize doesn't retry
  try {
    const payload = req.body;
    const eventType = payload.type || inferEventType(payload);

    if (!eventType) {
      console.warn('[Trainerize webhook] Could not determine event type:', JSON.stringify(payload).slice(0, 200));
      return res.status(200).json({ ok: true, skipped: 'unknown event' });
    }

    // Invalidate cache for any event that signals data changed for a client
    const CACHE_INVALIDATION_EVENTS = [
      'dailyWorkout.completed', 'dailyCardio.completed', 'bodystats.completed',
      'client.statusChanged', 'addOn.mfp.connected', 'addOn.fitbit.connected',
    ];
    if (CACHE_INVALIDATION_EVENTS.includes(eventType) && payload.userID) {
      invalidateCacheForClient(String(payload.userID));
    }

    const handler = TRAINERIZE_HANDLERS[eventType];

    if (handler === undefined) {
      // Event type not in our map at all
      console.warn(`[Trainerize webhook] Unrecognised event type: ${eventType}`);
      return res.status(200).json({ ok: true, skipped: 'unrecognised event' });
    }

    if (handler === null) {
      // Known event, no handler yet (stub)
      console.log(`[Trainerize webhook] ${eventType} — acknowledged (no handler)`);
      return res.status(200).json({ ok: true });
    }

    const result = await handler(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[Trainerize webhook] Error:', err.message);
    return res.status(200).json({ ok: true, error: 'internal' });
  }
});

module.exports = router;
