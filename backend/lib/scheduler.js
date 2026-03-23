const pool = require('../db/pool');
const { getCurrentCycleSunday, getCurrentMonthFirst, getEomDeadlineMonday } = require('./cycle');
const { trainerizePostRaw: trainerizePost, trainerizeUploadFile } = require('./trainerize');

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
          payload = { threadID: msg.trainerize_thread_id, body: msg.body, type: 'text' };
          if (msg.file_token) payload.fileToken = msg.file_token;
          await trainerizePost('/message/reply', payload);
        } else if (msg.trainerize_id) {
          payload = {
            recipients: [Number(msg.trainerize_id)],
            body: msg.body,
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

        // Send the text body
        const payload = { threadID: post.group_thread_id, body: post.body, type: 'text' };
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
 * Get the current date/time in Europe/Dublin timezone.
 * Returns { year, month, day, hour, minute, weekday }
 * where weekday is 0=Sun, 1=Mon, ..., 6=Sat (matching JS convention).
 */
function getDublinTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin',
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

/**
 * Check if weekly reminders have already been logged for this cycle.
 */
async function hasWeeklyRemindersBeenProcessed(cycleStart) {
  const result = await pool.query(
    `SELECT 1 FROM reminder_logs
     WHERE coach_id = $1 AND reminder_type = 'weekly_checkin' AND cycle_start = $2
     LIMIT 1`,
    [COACH_ID, cycleStart]
  );
  return result.rows.length > 0;
}

/**
 * Check if EOM reminders have already been logged for this cycle.
 */
async function hasEomRemindersBeenProcessed(cycleStart) {
  const result = await pool.query(
    `SELECT 1 FROM reminder_logs
     WHERE coach_id = $1 AND reminder_type = 'eom_report' AND cycle_start = $2
     LIMIT 1`,
    [COACH_ID, cycleStart]
  );
  return result.rows.length > 0;
}

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

    // --- Weekly reminder: Monday at 8:30pm Dublin time ---
    if (dublin.weekday === 1 && (dublin.hour > 20 || (dublin.hour === 20 && dublin.minute >= 30))) {
      const cycleStart = getCurrentCycleSunday();

      if (!(await hasWeeklyRemindersBeenProcessed(cycleStart))) {
        const settings = await getReminderSettings();
        const enabled = settings.global && settings.mfc;
        console.log(`[Reminders] Processing weekly check-in reminders (cycle: ${cycleStart}, enabled: ${enabled})`);

        // Find active MFC clients who haven't submitted for this cycle
        const result = await pool.query(
          `SELECT cl.id, cl.name, cl.trainerize_id, cl.reminders_enabled
           FROM clients cl
           WHERE cl.coach_id = $1
             AND cl.active = true
             AND cl.program = 'my_fit_coach'
             AND cl.id NOT IN (
               SELECT client_id FROM checkins
               WHERE coach_id = $1 AND type = 'weekly' AND cycle_start = $2
             )
           ORDER BY cl.name`,
          [COACH_ID, cycleStart]
        );

        const message = 'Hey [first name], just a reminder to fill out your weekly check-in when you get a chance. Here\'s the link: https://mfctransformations.typeform.com/checkingin';

        for (const client of result.rows) {
          const clientEnabled = enabled && client.reminders_enabled;
          await sendReminderDM(client, message, 'weekly_checkin', cycleStart, clientEnabled);
        }

        if (result.rows.length === 0) {
          console.log('[Reminders] No weekly reminders needed - all MFC clients have submitted');
        }
      }
    }

    // --- EOM reminder: deadline Monday at 7:00pm Dublin time ---
    if (dublin.weekday === 1 && dublin.hour >= 19) {
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

          if (!(await hasEomRemindersBeenProcessed(cycleStart))) {
            const settings = await getReminderSettings();
            const enabled = settings.global && settings.core;
            console.log(`[Reminders] Processing EOM report reminders (cycle: ${cycleStart}, enabled: ${enabled})`);

            // Find active Core clients who haven't submitted for this cycle
            const result = await pool.query(
              `SELECT cl.id, cl.name, cl.trainerize_id, cl.reminders_enabled
               FROM clients cl
               WHERE cl.coach_id = $1
                 AND cl.active = true
                 AND cl.program = 'my_fit_coach_core'
                 AND cl.id NOT IN (
                   SELECT client_id FROM checkins
                   WHERE coach_id = $1 AND type = 'eom_report' AND cycle_start = $2
                 )
               ORDER BY cl.name`,
              [COACH_ID, cycleStart]
            );

            const message = 'Hey [first name], just a reminder to fill out your end of month report when you get a chance. Here\'s the link: https://form.typeform.com/to/iISVFuRv';

            for (const client of result.rows) {
              const clientEnabled = enabled && client.reminders_enabled;
              await sendReminderDM(client, message, 'eom_report', cycleStart, clientEnabled);
            }

            if (result.rows.length === 0) {
              console.log('[Reminders] No EOM reminders needed - all Core clients have submitted');
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

function startScheduler() {
  console.log('[Scheduler] Started - checking every 60 seconds (all times UTC)');
  setInterval(async () => {
    await processScheduledMessages();
    await processScheduledPosts();
    await processReminders();
  }, 60 * 1000);

  // Run on startup after 5s delay to catch any due items
  setTimeout(async () => {
    await processScheduledMessages();
    await processScheduledPosts();
    await processReminders();
  }, 5000);
}

module.exports = { startScheduler };
