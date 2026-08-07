const pool = require('../db/pool');
const { getCurrentCycleSunday, getCurrentMonthFirst, getEomDeadlineMonday } = require('./cycle');
const { trainerizePostRaw: trainerizePost, trainerizeUploadFile } = require('./trainerize');

/**
 * Normalize line endings before sending text to Trainerize.
 * Posts composed/pasted from Word, Outlook, Notes etc. carry Windows CRLF
 * (\r\n) line endings. Trainerize's message renderer counts the \r and the \n
 * as separate breaks, so every line break shows up doubled. We collapse CRLF
 * (and lone CR) to a single LF, then cap runs at one blank line so paragraph
 * spacing renders as intended. Applied on send only - stored text is untouched.
 */
function normalizeBody(body) {
  if (!body) return body;
  return body
    .replace(/\r\n/g, '\n')      // Windows CRLF -> LF (this is what causes the doubling)
    .replace(/\r/g, '\n')        // any lone CR -> LF
    .replace(/[ \t]+\n/g, '\n')  // strip trailing spaces on a line (handles the "\n \n" variant)
    .replace(/\n{3,}/g, '\n\n');  // cap at one blank line between paragraphs
}

async function processScheduledMessages() {
  try {
    // send_at is stored as UTC TIMESTAMPTZ, now() is UTC - direct comparison works
    const result = await pool.query(
      `SELECT sm.id, sm.client_id, sm.body, sm.trainerize_thread_id, sm.file_token, c.trainerize_id
       FROM scheduled_messages sm
       JOIN clients c ON c.id = sm.client_id
       WHERE sm.status = 'pending' AND sm.send_at <= now()
       ORDER BY sm.send_at ASC
       LIMIT 10`
    );

    for (const msg of result.rows) {
      try {
        let payload;
        if (msg.trainerize_thread_id) {
          payload = { threadID: msg.trainerize_thread_id, body: normalizeBody(msg.body), type: 'text' };
          if (msg.file_token) payload.fileToken = msg.file_token;
          await trainerizePost('/message/reply', payload);
        } else if (msg.trainerize_id) {
          payload = {
            recipients: [Number(msg.trainerize_id)],
            body: normalizeBody(msg.body),
            threadType: 'mainThread',
            conversationType: 'single',
            type: 'text',
          };
          if (msg.file_token) payload.fileToken = msg.file_token;
          await trainerizePost('/message/send', payload);
        } else {
          throw new Error(`No thread ID or trainerize ID for scheduled message ${msg.id}`);
        }

        await pool.query(
          `UPDATE scheduled_messages SET status = 'sent' WHERE id = $1`,
          [msg.id]
        );
        console.log(`[Scheduler] Sent scheduled message ${msg.id} to client ${msg.client_id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to send message ${msg.id}:`, err.message);
        await pool.query(
          `UPDATE scheduled_messages SET status = 'failed' WHERE id = $1`,
          [msg.id]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error processing scheduled messages:', err.message);
  }
}

async function trainerizeUploadAttachment(fileBuffer, fileName, mimeType, threadID) {
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append('file', blob, fileName);
  form.append('data', JSON.stringify({
    attachType: 'messageAttachment',
    attachTo: Number(threadID),
  }));

  return trainerizeUploadFile(form);
}

async function processScheduledPosts() {
  try {
    const result = await pool.query(
      `SELECT id, group_thread_id, body, file_name, file_data, file_content_type
       FROM scheduled_posts
       WHERE status = 'pending' AND send_at <= now()
       ORDER BY send_at ASC
       LIMIT 10`
    );

    for (const post of result.rows) {
      try {
        // If the post has a file attachment, upload it first
        if (post.file_data && post.file_name) {
          console.log(`[Scheduler] Uploading attachment "${post.file_name}" for post ${post.id}`);
          await trainerizeUploadAttachment(
            post.file_data, post.file_name, post.file_content_type || 'application/octet-stream', post.group_thread_id
          );
          console.log(`[Scheduler] Attachment uploaded for post ${post.id}`);
        }

        // Send the text body (normalize line endings so Trainerize doesn't double the spacing)
        const payload = { threadID: post.group_thread_id, body: normalizeBody(post.body), type: 'text' };
        await trainerizePost('/message/reply', payload);

        await pool.query(
          `UPDATE scheduled_posts SET status = 'sent', sent_at = now() WHERE id = $1`,
          [post.id]
        );
        console.log(`[Scheduler] Sent scheduled post ${post.id} to group thread ${post.group_thread_id}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to send post ${post.id}:`, err.message);
        await pool.query(
          `UPDATE scheduled_posts SET status = 'failed' WHERE id = $1`,
          [post.id]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error processing scheduled posts:', err.message);
  }
}

const COACH_ID = 1; // Single coach for now

/**
 * Get the current date/time in a given timezone.
 * Returns { year, month, day, hour, minute, weekday }
 * where weekday is 0=Sun, 1=Mon, ..., 6=Sat (matching JS convention).
 */
function getTimeInZone(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const vals = {};
  for (const p of parts) vals[p.type] = p.value;

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(vals.year),
    month: Number(vals.month),
    day: Number(vals.day),
    hour: Number(vals.hour),
    minute: Number(vals.minute),
    weekday: weekdayMap[vals.weekday] ?? -1,
  };
}

function getDublinTime() {
  return getTimeInZone('Europe/Dublin');
}

// Both reminders deliberately have NO "has this cycle been processed?" gate.
// Whether a client still needs reminding is decided per client, by excluding
// anyone who already has a reminder_logs row for the cycle. A single global
// gate would mark the whole cycle done the moment the first client fired,
// which silently skips every client whose local 7pm has not arrived yet.

/**
 * Check if reminders are enabled in coach_settings. Defaults to true.
 * Returns { global, mfc, core } booleans.
 */
async function getReminderSettings() {
  const result = await pool.query(
    `SELECT reminders_enabled, mfc_reminders_enabled, core_reminders_enabled
     FROM coach_settings WHERE coach_id = $1`,
    [COACH_ID]
  );
  if (result.rows.length === 0) return { global: true, mfc: true, core: true };
  const row = result.rows[0];
  return {
    global: row.reminders_enabled,
    mfc: row.mfc_reminders_enabled,
    core: row.core_reminders_enabled,
  };
}

// Backwards-compatible wrapper
async function areRemindersEnabled() {
  const settings = await getReminderSettings();
  return settings.global;
}

/**
 * Send a check-in reminder DM to a single client via Trainerize.
 */
async function sendReminderDM(client, messageBody, reminderType, cycleStart, enabled) {
  const firstName = client.name.split(' ')[0];
  const personalMessage = messageBody.replace('[first name]', firstName);

  if (!enabled) {
    // Log as skipped
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, $3, $4, false, 'reminders_disabled')
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, reminderType, cycleStart]
    );
    console.log(`[Reminders] Skipped (disabled) ${reminderType} reminder for ${client.name}`);
    return;
  }

  if (!client.trainerize_id) {
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, $3, $4, false, 'no_trainerize_id')
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, reminderType, cycleStart]
    );
    console.log(`[Reminders] Skipped ${reminderType} reminder for ${client.name} - no trainerize_id`);
    return;
  }

  try {
    await trainerizePost('/message/send', {
      recipients: [Number(client.trainerize_id)],
      body: personalMessage,
      threadType: 'mainThread',
      conversationType: 'single',
      type: 'text',
    });

    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, reminderType, cycleStart]
    );
    console.log(`[Reminders] Sent ${reminderType} reminder to ${client.name} at ${new Date().toISOString()}`);
  } catch (err) {
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, $3, $4, false, $5)
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, reminderType, cycleStart, `send_failed: ${err.message}`]
    );
    console.error(`[Reminders] Failed to send ${reminderType} reminder to ${client.name}:`, err.message);
  }
}

/**
 * Process check-in deadline reminders.
 * Called every 60 seconds by the scheduler loop.
 */
async function processReminders() {
  try {
    const dublin = getDublinTime();

    // --- Weekly reminder: Monday at 7:00pm in each client's local timezone ---
    // Check if it's Monday in Dublin (as a gate to avoid unnecessary DB queries on other days)
    if (dublin.weekday === 1) {
      const cycleStart = getCurrentCycleSunday();
      const settings = await getReminderSettings();
      const enabled = settings.global && settings.mfc;

      // Find active MFC clients who haven't submitted AND haven't been reminded yet this cycle
      const result = await pool.query(
        `SELECT cl.id, cl.name, cl.trainerize_id, cl.reminders_enabled, cl.timezone
         FROM clients cl
         WHERE cl.coach_id = $1
           AND cl.active = true
           AND cl.program = 'my_fit_coach'
           AND cl.id NOT IN (
             SELECT client_id FROM checkins
             WHERE coach_id = $1 AND type = 'weekly' AND cycle_start = $2
           )
           AND cl.id NOT IN (
             SELECT client_id FROM reminder_logs
             WHERE coach_id = $1 AND reminder_type = 'weekly_checkin' AND cycle_start = $2
           )
         ORDER BY cl.name`,
        [COACH_ID, cycleStart]
      );

      const message = 'Hey [first name], just a nudge on your check-in. Still time to get it in if you haven\'t got the chance yet. 🙌';

      for (const client of result.rows) {
        // Check if it's past 8:30pm Monday in this client's timezone
        const clientTz = client.timezone || 'Europe/Dublin';
        let clientTime;
        try {
          clientTime = getTimeInZone(clientTz);
        } catch (e) {
          console.warn(`[Reminders] Invalid timezone "${clientTz}" for ${client.name}, falling back to Dublin`);
          clientTime = dublin;
        }

        // 7pm, one hour after the 6pm deadline stated in the Sunday auto
        // message - a grace-period nudge, not a pre-deadline warning.
        if (clientTime.weekday === 1 && clientTime.hour >= 19) {
          const clientEnabled = enabled && client.reminders_enabled;
          await sendReminderDM(client, message, 'weekly_checkin', cycleStart, clientEnabled);
        }
      }
    }

    // --- EOM reminder: deadline Monday at 7:00pm in each client's timezone ---
    // Dublin only gates the day here, exactly as the weekly reminder does. The
    // 7pm check is per client below, so a Core client abroad is reminded at
    // their own 7pm rather than Dublin's.
    if (dublin.weekday === 1) {
      // Check if today is the EOM deadline Monday for the current or previous month
      const monthsToCheck = [
        { year: dublin.year, month: dublin.month },
      ];
      // Also check previous month (deadline Monday might fall in next month)
      if (dublin.month === 1) {
        monthsToCheck.push({ year: dublin.year - 1, month: 12 });
      } else {
        monthsToCheck.push({ year: dublin.year, month: dublin.month - 1 });
      }

      for (const { year, month } of monthsToCheck) {
        const deadline = getEomDeadlineMonday(year, month);

        if (deadline.year === dublin.year && deadline.month === dublin.month && deadline.day === dublin.day) {
          // Today is the EOM deadline Monday for this month
          const cycleStart = `${year}-${String(month).padStart(2, '0')}-01`;

          const settings = await getReminderSettings();
          const enabled = settings.global && settings.core;

          // Core clients who have not submitted AND have not already been
          // reminded this cycle.
          //
          // The per-client reminder_logs exclusion replaces the old single
          // "has this cycle been processed?" gate. That gate was safe only
          // while every client fired in the same minute on Dublin time - with
          // per-client timezones the first client to be reminded would have
          // marked the whole cycle done and everyone further west would have
          // been skipped for good.
          const result = await pool.query(
            `SELECT cl.id, cl.name, cl.trainerize_id, cl.reminders_enabled, cl.timezone
             FROM clients cl
             WHERE cl.coach_id = $1
               AND cl.active = true
               AND cl.program = 'my_fit_coach_core'
               AND cl.id NOT IN (
                 SELECT client_id FROM checkins
                 WHERE coach_id = $1 AND type = 'eom_report' AND cycle_start = $2
               )
               AND cl.id NOT IN (
                 SELECT client_id FROM reminder_logs
                 WHERE coach_id = $1 AND reminder_type = 'eom_report' AND cycle_start = $2
               )
             ORDER BY cl.name`,
            [COACH_ID, cycleStart]
          );

          const message = 'Hey [first name], just sending a nudge on your check-in. Still time to get it in or book in for a call if you haven\'t already  🙌';

          for (const client of result.rows) {
            const clientTz = client.timezone || 'Europe/Dublin';
            let clientTime;
            try {
              clientTime = getTimeInZone(clientTz);
            } catch (e) {
              console.warn(`[Reminders] Invalid timezone "${clientTz}" for ${client.name}, falling back to Dublin`);
              clientTime = dublin;
            }

            if (clientTime.weekday === 1 && clientTime.hour >= 19) {
              const clientEnabled = enabled && client.reminders_enabled;
              await sendReminderDM(client, message, 'eom_report', cycleStart, clientEnabled);
            }
          }

          break; // Only process once even if both months match today
        }
      }
    }
  } catch (err) {
    console.error('[Reminders] Error processing reminders:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Daily client reconciliation
// ---------------------------------------------------------------------------
// Safety net for missed `client.added` webhooks. The webhook is fire-once and
// real-time, with no retry - if the portal was down or mid-deploy when it
// fired, that client never lands in the portal. Once a day we pull the full
// active client list from Trainerize and insert anyone missing, so a dropped
// webhook can never again leave a paying client off the dashboard.

const COACH_TRAINERIZE_ID = 5343380; // Trainerize trainer/coach ID for this portal
const RECONCILE_PAGE_SIZE = 100;

// Tag name -> program (same mapping used by import-clients.js and the webhook handler)
const TAG_PROGRAM_MAP = {
  'Connor - MyFitCoach':      'my_fit_coach',
  'Connor - Core MyFitCoach': 'my_fit_coach_core',
};

// Fetch all active Trainerize clients for this coach, paginated.
async function fetchAllActiveTrainerizeClients() {
  const clients = [];
  let start = 0;
  while (true) {
    const data = await trainerizePost('/user/getClientList', {
      userID: COACH_TRAINERIZE_ID, view: 'activeClient', start, count: RECONCILE_PAGE_SIZE,
    });
    const users = data.users || [];
    clients.push(...users);
    if (users.length < RECONCILE_PAGE_SIZE || clients.length >= (data.total || Infinity)) break;
    start += RECONCILE_PAGE_SIZE;
  }
  return clients;
}

// Build a map of Trainerize userID -> program by resolving the two program tags.
async function fetchProgramByUserId() {
  const programByUserId = {};
  let tagList;
  try {
    tagList = await trainerizePost('/userTag/getList', {});
  } catch (e) {
    console.warn('[Reconcile] Could not fetch tag list - clients will be added without a program:', e.message);
    return programByUserId;
  }
  const programTags = (tagList.userTags || []).filter(t => TAG_PROGRAM_MAP[t.name]);
  for (const t of programTags) {
    let start = 0;
    while (true) {
      const data = await trainerizePost('/user/getClientList', {
        userID: COACH_TRAINERIZE_ID, view: 'activeClient', filter: { userTag: t.id }, start, count: RECONCILE_PAGE_SIZE,
      });
      const users = data.users || [];
      for (const u of users) programByUserId[u.id] = TAG_PROGRAM_MAP[t.name];
      if (users.length < RECONCILE_PAGE_SIZE) break;
      start += RECONCILE_PAGE_SIZE;
    }
  }
  return programByUserId;
}

async function reconcileClients() {
  try {
    const clients = await fetchAllActiveTrainerizeClients();
    if (!clients.length) {
      // An empty list almost certainly means an API hiccup, not zero clients.
      // Bail rather than risk acting on bad data.
      console.warn('[Reconcile] Trainerize returned no active clients - skipping this run');
      return;
    }

    const programByUserId = await fetchProgramByUserId();

    // An empty map means the tag lookup failed or returned nothing, not that
    // every client is untagged. Correcting against it would clear the program
    // on all of them, so treat program data as unavailable for this run.
    const canCorrectPrograms = Object.keys(programByUserId).length > 0;
    if (!canCorrectPrograms) {
      console.warn('[Reconcile] No program tags resolved - skipping program corrections this run');
    }

    let added = 0;
    let linked = 0;
    let corrected = 0;

    for (const c of clients) {
      const trainerizeId = String(c.id);
      const name = `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim();
      const email = (c.email || '').toLowerCase() || null;
      if (!name) continue;

      // Already linked by trainerize_id - keep the program in step with the
      // Trainerize tag. Tags are the source of truth for which program a client
      // is on, and nothing else ever rewrites program, so a dropped or
      // misread userTag webhook would otherwise leave the portal stale forever.
      const byTid = await pool.query(
        `SELECT id, name, program FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
        [trainerizeId, COACH_ID]
      );
      if (byTid.rows.length > 0) {
        const row = byTid.rows[0];
        const tagProgram = programByUserId[c.id];
        // No tag resolved means "unknown", never "clear the program".
        if (canCorrectPrograms && tagProgram && tagProgram !== row.program) {
          await pool.query(
            `UPDATE clients SET program = $1 WHERE id = $2 AND coach_id = $3`,
            [tagProgram, row.id, COACH_ID]
          );
          console.log(
            `[Reconcile] Corrected program for "${row.name}" (id=${row.id}): ` +
            `${row.program || 'none'} -> ${tagProgram}`
          );
          corrected++;
        }
        continue;
      }

      // A row may exist by email but with no trainerize_id (e.g. the webhook
      // created it before the userID lookup resolved). Link it, don't duplicate.
      if (email) {
        const byEmail = await pool.query(
          `SELECT id, trainerize_id FROM clients WHERE lower(email) = $1 AND coach_id = $2`,
          [email, COACH_ID]
        );
        if (byEmail.rows.length > 0) {
          const row = byEmail.rows[0];
          if (!row.trainerize_id) {
            await pool.query(
              `UPDATE clients SET trainerize_id = $1, program = COALESCE(program, $2) WHERE id = $3`,
              [trainerizeId, programByUserId[c.id] || null, row.id]
            );
            console.log(`[Reconcile] Linked "${name}" (id=${row.id}) to trainerize_id=${trainerizeId}`);
            linked++;
          }
          continue;
        }
      }

      // Genuinely missing - insert mirroring the webhook path (pending_setup,
      // trainerize_joined_at = now). Historical backfill stays a separate manual step.
      const program = programByUserId[c.id] || null;
      const ins = await pool.query(
        `INSERT INTO clients (coach_id, trainerize_id, name, email, program, pending_setup, active, trainerize_joined_at)
         VALUES ($1, $2, $3, $4, $5, true, true, now())
         RETURNING id`,
        [COACH_ID, trainerizeId, name, email, program]
      );
      console.log(`[Reconcile] Added missing client "${name}" (id=${ins.rows[0].id}, trainerize_id=${trainerizeId}, program=${program || 'pending'})`);
      added++;
    }

    if (added || linked || corrected) {
      console.log(
        `[Reconcile] Done - ${added} added, ${linked} linked, ${corrected} program(s) corrected, ` +
        `${clients.length} active checked.`
      );
    } else {
      console.log(`[Reconcile] Done - all ${clients.length} active Trainerize clients already present and in sync.`);
    }
  } catch (err) {
    console.error('[Reconcile] Error:', err.message);
  }
}

// Gate reconciliation to run at most once per Dublin calendar day, after 06:00.
// In-memory tracking is intentional: on restart it simply runs once more that
// day, which is harmless (the job is idempotent) and useful as a catch-up.
// ---------------------------------------------------------------------------
// Daily database backup
// ---------------------------------------------------------------------------
// Runs once a day at 03:00 Dublin, when nothing else is happening. Uploads a
// full dump to Cloudflare R2 and applies the retention policy.
//
// Tracked in memory like the reconcile job: on restart it simply runs once
// more that day, which is harmless. An extra backup is never a problem; a
// missing one is.
let lastBackupDay = null;
async function maybeRunBackup() {
  const dublin = getDublinTime();
  const dayKey = `${dublin.year}-${String(dublin.month).padStart(2, '0')}-${String(dublin.day).padStart(2, '0')}`;
  if (dayKey === lastBackupDay) return;
  if (dublin.hour < 3) return;

  const backup = require('./backup');
  const r2 = require('./r2');
  if (!r2.isConfigured()) {
    // Say so once a day rather than silently doing nothing - a backup that is
    // quietly not running is worse than one that is loudly broken.
    lastBackupDay = dayKey;
    console.warn('[Backup] R2 is not configured - no backup taken. Set R2_* variables.');
    return;
  }

  lastBackupDay = dayKey;
  try {
    console.log(`[Backup] Starting daily backup (${dayKey} Dublin)`);
    const res = await backup.runBackup();
    const p = await backup.prune();
    console.log(
      `[Backup] Done - ${res.rows.toLocaleString()} rows across ${res.tables} tables, ` +
      `${(res.gzBytes / 1048576).toFixed(1)} MB compressed -> ${res.key} ` +
      `(retention: ${p.kept} kept, ${p.deleted} removed)`
    );
  } catch (err) {
    // Loud, and it will try again tomorrow.
    console.error(`[Backup] FAILED - no backup was taken today: ${err.message}`);
  }
}

let lastReconcileDay = null;
async function maybeReconcileClients() {
  const dublin = getDublinTime();
  const dayKey = `${dublin.year}-${String(dublin.month).padStart(2, '0')}-${String(dublin.day).padStart(2, '0')}`;
  if (dayKey === lastReconcileDay) return;
  if (dublin.hour < 6) return;
  lastReconcileDay = dayKey;
  console.log(`[Reconcile] Running daily client reconciliation (${dayKey} Dublin)`);
  await reconcileClients();
}

function startScheduler() {
  console.log('[Scheduler] Started - checking every 60 seconds (all times UTC)');
  setInterval(async () => {
    await processScheduledMessages();
    await processScheduledPosts();
    await processReminders();
    await maybeReconcileClients();
    await maybeRunBackup();
  }, 60 * 1000);

  // Run on startup after 5s delay to catch any due items
  setTimeout(async () => {
    await processScheduledMessages();
    await processScheduledPosts();
    await processReminders();
    await maybeReconcileClients();
    await maybeRunBackup();
  }, 5000);
}

module.exports = { startScheduler, normalizeBody, reconcileClients };
