/**
 * Trainerize Auto Messages connector.
 *
 * An Auto Message sits on a date in the client's Trainerize calendar and fires
 * at a set time. It is a Trainerize object: it sends whether or not the portal
 * is running. This is a third mechanism, distinct from `scheduled_messages`
 * (portal-held DMs) and `scheduled_posts` (portal-held group posts).
 *
 * THE NAMING TRAP: the calendar feature called "Auto messages" is served by
 * `dailyMessage/*`, NOT `autoMessage/*`. The latter is a different feature
 * (business auto-responders) and returns 403 on our token. See docs/logic.md.
 *
 * THE HARD LIMITATION: auto messages cannot be enumerated through the API.
 * There is no dailyMessage/getList and calendar/getList omits them. The
 * `auto_messages` table is therefore the ONLY record that a message exists -
 * treat it as the recovery mechanism, and never create one without recording
 * it. Anything created outside this module is invisible to us forever and can
 * only be removed by hand in the Trainerize app.
 *
 * TIMEZONE: `sendTime` is minutes from midnight resolved against the CLIENT's
 * own Trainerize timezone, not Dublin and not UTC. Do not apply the
 * Dublin-to-UTC conversion used elsewhere in the portal. 720 means each client
 * gets it at their local noon.
 */

const pool = require('../db/pool');
const templates = require('./auto-message-templates');

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const COACH_ID = 1;
const COACH_TRAINERIZE_ID = 5343380;
const COACH_FIRST_NAME = 'Connor';
const COACH_LAST_NAME = 'Meyler';

const TIMEOUT_MS = 10000;
// Trainerize allows 1000 requests/minute. 80ms between calls is ~750/min,
// comfortably inside it even with retries.
const THROTTLE_MS = 80;

function authHeader() {
  return 'Basic ' + Buffer.from(
    `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
  ).toString('base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(endpoint, body, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      // 429 is the documented rate-limit response - back off and retry once.
      if (res.status === 429 && attempt <= 2) {
        clearTimeout(timer);
        await sleep(5000);
        return post(endpoint, body, attempt + 1);
      }
      const message = (json && (json.message || json.error)) || text.slice(0, 200) || `HTTP ${res.status}`;
      const err = new Error(`Trainerize ${endpoint} ${res.status}: ${message}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } catch (err) {
    if (attempt === 1 && (err.name === 'AbortError' || err.message.includes('fetch failed'))) {
      await sleep(3000);
      return post(endpoint, body, 2);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the dailyMessage/add payload.
 *
 * The null fields mirror exactly what the Trainerize web app sends. A minimal
 * { body, type } is accepted, but fidelity with the app keeps the message
 * editable there afterwards.
 */
function buildPayload({ trainerizeUserId, date, sendTimeMinutes, title, body }) {
  return {
    userID: trainerizeUserId,
    date,                       // YYYY-MM-DD, client-local calendar date
    sendTime: sendTimeMinutes,  // minutes from midnight, client-local
    title,                      // REQUIRED - omitting it returns a 500
    detail: {
      messages: [{
        body,
        type: 'text',
        messageID: null,
        source: 'user',
        sender: {
          userID: COACH_TRAINERIZE_ID,
          firstName: COACH_FIRST_NAME,
          lastName: COACH_LAST_NAME,
        },
        linkInfo: null,
        workoutInfo: null,
        attachment: null,
        productInfo: null,
        appointmentInfo: null,
      }],
    },
  };
}

/**
 * Substitute the client's first name into the message body.
 *
 * Trainerize does NOT resolve {firstName} at send time. This was documented as
 * verified, and it is wrong - a test message scheduled on Connor's own account
 * on 2026-08-06 arrived reading "Good afternoon {firstName}" literally.
 *
 * So we substitute ourselves before sending. Each client gets their own copy of
 * the body with their real name already in it, which is guaranteed to render
 * correctly and removes any dependency on undocumented Trainerize behaviour.
 */
function personalise(body, client) {
  const firstName = String(client.name || '').trim().split(/\s+/)[0] || 'there';
  const lastName = String(client.name || '').trim().split(/\s+/).slice(1).join(' ');
  return String(body)
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{lastName\}/g, lastName);
}

/** Create one auto message and record it. Returns the Trainerize message id. */
async function createOne({ client, date, sendTimeMinutes, title, body, kind, batchId }) {
  const result = await post('/dailyMessage/add', buildPayload({
    trainerizeUserId: Number(client.trainerize_id),
    date, sendTimeMinutes, title,
    body: personalise(body, client),
  }));

  const messageId = result && (result.id != null ? result.id : null);
  if (messageId == null) {
    throw new Error(`dailyMessage/add returned no id (${JSON.stringify(result).slice(0, 200)})`);
  }

  // Record BEFORE returning. If this insert ever fails the message exists in
  // Trainerize with no record of it, which is unrecoverable - so it throws
  // loudly rather than being swallowed.
  await pool.query(
    `INSERT INTO auto_messages
       (coach_id, client_id, trainerize_user_id, trainerize_message_id,
        kind, send_date, send_time_minutes, title, batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [COACH_ID, client.id, Number(client.trainerize_id), messageId,
      kind, date, sendTimeMinutes, title, batchId]
  );

  return messageId;
}

/** Delete one auto message and mark it deleted in the log. */
async function deleteOne(row) {
  await post('/dailyMessage/delete', {
    id: Number(row.trainerize_message_id),
    userID: Number(row.trainerize_user_id),
  });
  await pool.query(
    `UPDATE auto_messages SET deleted_at = now() WHERE id = $1`,
    [row.id]
  );
}

/** Read one back from Trainerize. Returns null on 404. */
async function fetchOne(messageId, trainerizeUserId) {
  try {
    return await post('/dailyMessage/get', {
      id: Number(messageId), userID: Number(trainerizeUserId),
    });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function isoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The next `count` Sundays strictly after `from`.
 *
 * Strictly after matters: the docs note Trainerize accepts past dates without
 * complaint, so scheduling "from today" on a Sunday afternoon would silently
 * create a message that can never fire.
 */
function nextSundays(count, from = new Date()) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const daysAhead = (7 - start.getUTCDay()) % 7 || 7; // never 0
  const first = new Date(start);
  first.setUTCDate(start.getUTCDate() + daysAhead);

  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(first);
    d.setUTCDate(first.getUTCDate() + i * 7);
    out.push(isoDate(d));
  }
  return out;
}

/**
 * The last Saturday of each of the next `count` months, strictly after `from`.
 * Matches the EOM cycle already implemented by getEomDeadlineMonday in cycle.js
 * (report opens the last Saturday, deadline the following Monday).
 */
function nextLastSaturdays(count, from = new Date()) {
  const out = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth(); // 0-based
  const todayIso = isoDate(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())));

  while (out.length < count) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const offset = (lastDay.getUTCDay() + 1) % 7; // Sat=0, Sun=1, Mon=2...
    const lastSat = new Date(lastDay);
    lastSat.setUTCDate(lastDay.getUTCDate() - offset);
    const iso = isoDate(lastSat);
    if (iso > todayIso) out.push(iso);
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return out;
}

/**
 * Swap in any month that does not follow the usual last-Saturday rule.
 *
 * Returns the adjusted date list plus a date -> body map for the sends whose
 * copy differs. Order is preserved because an exception only ever moves a date
 * earlier within its own month.
 *
 * Lives here rather than in the scheduling script because BOTH paths need it:
 * the yearly run and a single client switched onto Core mid-year. When it sat
 * in the script only, --switch quietly scheduled the raw last Saturday - so a
 * client moved to Core before Christmas got 26 Dec, out of step with everyone
 * else on 19 Dec, and with the standard wording rather than the Christmas one.
 */
function applyEomExceptions(dates) {
  const bodyByDate = {};
  const applied = [];
  const out = dates.map((date) => {
    const ex = templates.EOM_EXCEPTIONS[date.slice(0, 7)];
    if (!ex) return date;
    bodyByDate[ex.date] = ex.body;
    applied.push({ from: date, to: ex.date, reason: ex.reason });
    return ex.date;
  });
  return { dates: out, bodyByDate, applied };
}

// ---------------------------------------------------------------------------
// Batch scheduling
// ---------------------------------------------------------------------------

/** Live (not deleted) future auto messages a client already has, by kind. */
async function liveCountFor(clientId, kind) {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM auto_messages
     WHERE coach_id = $1 AND client_id = $2 AND kind = $3
       AND deleted_at IS NULL AND send_date >= CURRENT_DATE`,
    [COACH_ID, clientId, kind]
  );
  return r.rows[0].n;
}

/**
 * Reconcile what we think a client has against what Trainerize actually has.
 *
 * Messages deleted by hand in the Trainerize app leave our log stale: it still
 * claims 52 are scheduled when the calendar is empty. That stale count would
 * then make the idempotency check refuse to reschedule the client, which is
 * the worst outcome - the coach thinks they are covered and they are not.
 *
 * We cannot list a client's messages, but we CAN read any recorded id back,
 * and a deleted one returns 404.
 *
 * Two passes, deliberately:
 *
 *  1. Sample the next few. If they all still exist, the log is trustworthy and
 *     we stop - a few API calls in the common case.
 *  2. If any is missing, check EVERY live row and mark exactly the missing
 *     ones deleted.
 *
 * The second pass is what makes this safe. An earlier version cleared the
 * whole client's log when the sample came back empty, which was wrong: a coach
 * deleting only the next few weeks would have had all 52 rows marked gone,
 * and the reschedule would then have stacked a fresh year on top of the ~49
 * still sitting live in Trainerize. Marking only what is genuinely absent
 * cannot produce duplicates.
 */
async function reconcileClient(clientId, kind, { sample = 3 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM auto_messages
     WHERE coach_id = $1 AND client_id = $2 AND kind = $3
       AND deleted_at IS NULL AND send_date >= CURRENT_DATE
     ORDER BY send_date`,
    [COACH_ID, clientId, kind]
  );
  if (rows.length === 0) return { checked: 0, missing: 0, cleared: 0 };

  // Pass 1 - cheap check of the soonest few.
  let sampleMissing = 0;
  for (const row of rows.slice(0, sample)) {
    if (await fetchOne(row.trainerize_message_id, row.trainerize_user_id) === null) sampleMissing++;
    await sleep(THROTTLE_MS);
  }
  if (sampleMissing === 0) return { checked: Math.min(sample, rows.length), missing: 0, cleared: 0 };

  // Pass 2 - something has been deleted by hand, so establish exactly what.
  const missingIds = [];
  for (const row of rows) {
    if (await fetchOne(row.trainerize_message_id, row.trainerize_user_id) === null) missingIds.push(row.id);
    await sleep(THROTTLE_MS);
  }

  let cleared = 0;
  if (missingIds.length > 0) {
    const res = await pool.query(
      `UPDATE auto_messages SET deleted_at = now() WHERE id = ANY($1::int[])`,
      [missingIds]
    );
    cleared = res.rowCount;
  }
  return { checked: rows.length, missing: missingIds.length, cleared };
}

/**
 * Clients whose programme no longer matches the auto messages they have
 * scheduled - e.g. moved to Core but still holding weekly Sunday prompts.
 *
 * This is the safety net for a switchover done by hand and not mentioned.
 * It only reports; correcting is a deliberate command, never automatic.
 */
async function findProgrammeMismatches() {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.program, a.kind, count(*)::int AS scheduled,
            min(a.send_date) AS next
     FROM auto_messages a
     JOIN clients c ON c.id = a.client_id
     WHERE a.coach_id = $1 AND a.deleted_at IS NULL AND a.send_date >= CURRENT_DATE
       AND c.active = true
       AND ((c.program = 'my_fit_coach'      AND a.kind <> 'weekly')
         OR (c.program = 'my_fit_coach_core' AND a.kind <> 'eom'))
     GROUP BY c.id, c.name, c.program, a.kind
     ORDER BY c.name`,
    [COACH_ID]
  );
  return rows;
}

/**
 * Clients on a programme who have NO auto messages scheduled at all - the
 * other half of the switchover gap, where the old ones were deleted by hand
 * and the new ones never created.
 */
async function findMissingSchedules() {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.program
     FROM clients c
     WHERE c.coach_id = $1 AND c.active = true
       AND c.trainerize_id IS NOT NULL
       AND c.program IN ('my_fit_coach', 'my_fit_coach_core')
       AND NOT EXISTS (
         SELECT 1 FROM auto_messages a
         WHERE a.client_id = c.id AND a.deleted_at IS NULL
           AND a.send_date >= CURRENT_DATE
           AND a.kind = CASE WHEN c.program = 'my_fit_coach' THEN 'weekly' ELSE 'eom' END
       )
     ORDER BY c.name`,
    [COACH_ID]
  );
  // Clients who deliberately get no EOM prompt are not "missing" one.
  const optOut = new Set(templates.EOM_OPT_OUT);
  return rows.filter((r) => !(r.program === 'my_fit_coach_core' && optOut.has(r.name)));
}

/**
 * Schedule a run of auto messages for one client.
 *
 * Idempotent by design: a client who already has live future messages of this
 * kind is skipped rather than stacked. Pressing run twice cannot double them up.
 */
async function scheduleForClient({ client, dates, sendTimeMinutes, title, body, bodyByDate, kind, batchId, dryRun }) {
  if (!client.trainerize_id) {
    return { client: client.name, skipped: 'no trainerize_id', created: 0 };
  }

  let existing = await liveCountFor(client.id, kind);
  if (existing > 0) {
    // Trust Trainerize over our own records: messages deleted by hand in the
    // app leave the log stale, and skipping on a stale count would wrongly
    // leave the client with nothing scheduled.
    const check = await reconcileClient(client.id, kind);
    if (check.cleared > 0) {
      console.log(`[AutoMessages] ${client.name}: ${check.cleared} logged ${kind} message(s) no longer exist in Trainerize (deleted in the app) - log corrected`);
      existing = await liveCountFor(client.id, kind);
    }
  }
  if (existing > 0) {
    // Some are still genuinely scheduled. Do not top up to a full year here -
    // that would leave an uneven, half-overlapping run. Deal with it
    // explicitly via --switch or --rollback-client.
    return { client: client.name, skipped: `already has ${existing} scheduled`, created: 0 };
  }

  if (dryRun) {
    return { client: client.name, wouldCreate: dates.length, first: dates[0], last: dates[dates.length - 1], created: 0 };
  }

  const ids = [];
  for (const date of dates) {
    const id = await createOne({
      client, date, sendTimeMinutes, title,
      body: (bodyByDate && bodyByDate[date]) || body,
      kind, batchId,
    });
    ids.push(id);
    await sleep(THROTTLE_MS);
  }
  return { client: client.name, created: ids.length, first: dates[0], last: dates[dates.length - 1] };
}

/** Roll back every message created by a batch. */
async function rollbackBatch(batchId) {
  const { rows } = await pool.query(
    `SELECT * FROM auto_messages WHERE batch_id = $1 AND deleted_at IS NULL`,
    [batchId]
  );
  let deleted = 0;
  const failures = [];
  for (const row of rows) {
    try {
      await deleteOne(row);
      deleted++;
    } catch (err) {
      failures.push({ id: row.trainerize_message_id, error: err.message });
    }
    await sleep(THROTTLE_MS);
  }
  return { deleted, failures, total: rows.length };
}

/**
 * Roll back live messages for one client and kind.
 *
 * `futureOnly` limits it to sends that have not happened yet. A programme
 * switch wants that: the old prompts a client already received are history,
 * and deleting them only strips their Trainerize calendar of a true record.
 * Undoing a batch created in error still wants the default, everything.
 */
async function rollbackClient(clientId, kind, { futureOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM auto_messages
     WHERE coach_id = $1 AND client_id = $2 AND kind = $3 AND deleted_at IS NULL
       ${futureOnly ? 'AND send_date >= CURRENT_DATE' : ''}`,
    [COACH_ID, clientId, kind]
  );
  let deleted = 0;
  const failures = [];
  for (const row of rows) {
    try {
      await deleteOne(row);
      deleted++;
    } catch (err) {
      failures.push({ id: row.trainerize_message_id, error: err.message });
    }
    await sleep(THROTTLE_MS);
  }
  return { deleted, failures, total: rows.length };
}

module.exports = {
  COACH_ID,
  COACH_TRAINERIZE_ID,
  post,
  personalise,
  buildPayload,
  createOne,
  deleteOne,
  fetchOne,
  nextSundays,
  nextLastSaturdays,
  applyEomExceptions,
  liveCountFor,
  reconcileClient,
  findProgrammeMismatches,
  findMissingSchedules,
  scheduleForClient,
  rollbackBatch,
  rollbackClient,
};
