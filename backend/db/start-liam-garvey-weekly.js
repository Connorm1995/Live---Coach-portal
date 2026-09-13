#!/usr/bin/env node
/**
 * One-off script: finish setting Liam Garvey up and start his Sunday prompts.
 *
 * Added straight into Trainerize on 12 Sep 2026, not through the onboarding
 * form. The client.added webhook created his portal record (id 77,
 * trainerize_id 31296144) with program = NULL and pending_setup = true, and
 * the nightly reconcile then set program = my_fit_coach from his
 * "Connor - MyFitCoach" tag. So the programme is already right; what is left
 * is the pending flag, and he has nothing scheduled.
 *
 * Connor asked on 13 Sep 2026 (a Sunday) for his prompts to start next Sunday,
 * the 20th, for the year.
 *
 * Three things:
 *   1. Confirm the Trainerize tag still says high ticket. reconcileClients()
 *      treats the tag as the source of truth and rewrites clients.program from
 *      it nightly, so scheduling against a programme the tag disagrees with
 *      would be undone within a day.
 *   2. pending_setup = false. It drives the "pending" badge in Client Manager
 *      and sorts him to the top of the list as needing attention, which he no
 *      longer does once this has run.
 *   3. A reminder_logs row for the 2026-09-13 cycle, so the Monday 7pm nudge
 *      on 14 Sep stays quiet, then 52 weekly prompts from Sunday 20 Sep.
 *
 * Why the nudge needs suppressing even though nobody asked this time: he has
 * no prompt for the cycle that started today, but the Monday nudge does not
 * know that. It picks up any active my_fit_coach client with no check-in and
 * no reminder_logs row for the cycle, and he matches all three. He would be
 * chased tomorrow for a check-in he was never sent. Same reasoning as Gavin
 * Bluett on 4 Sep and Stephen Hudson on 12 Sep.
 *
 * Dry run is the default. Nothing is written without --commit.
 *
 * Idempotent - every step checks its own state first, so re-running reports
 * what is already done and changes nothing.
 *
 * Usage:
 *   node backend/db/start-liam-garvey-weekly.js
 *   node backend/db/start-liam-garvey-weekly.js --commit
 *
 * Roll the messages back with the batch id printed at the end:
 *   node backend/db/schedule-auto-messages.js --rollback <batch_id>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');
const am = require('../lib/auto-messages');
const templates = require('../lib/auto-message-templates');

const COACH_ID = 1;
const COACH_TRAINERIZE_ID = 5343380;
const TRAINERIZE_ID = '31296144';
const PROGRAM = 'my_fit_coach';
const PROGRAM_TAG = 'Connor - MyFitCoach';

// The Sunday his prompts start. Today, the 13th, is deliberately skipped.
const FIRST_SUNDAY = '2026-09-20';
// The cycle the skipped week belongs to, as getCurrentCycleSunday() returns it
// on Monday 14 Sep. Suppresses that Monday's 7pm nudge only.
const SKIP_CYCLE = '2026-09-13';

async function loadClient() {
  const { rows } = await pool.query(
    `SELECT id, name, trainerize_id, timezone, program, pending_setup, active, reminders_enabled
     FROM clients WHERE coach_id = $1 AND trainerize_id = $2`,
    [COACH_ID, TRAINERIZE_ID]
  );
  if (rows.length === 0) throw new Error(`No client with trainerize_id ${TRAINERIZE_ID}`);
  if (rows.length > 1) throw new Error(`${rows.length} clients share trainerize_id ${TRAINERIZE_ID}`);
  return rows[0];
}

/** Is he still carrying the high ticket tag in Trainerize? */
async function hasProgramTag() {
  const tagList = await am.post('/userTag/getList', {});
  const tag = (tagList.userTags || []).find((t) => t.name === PROGRAM_TAG);
  if (!tag) throw new Error(`Trainerize has no tag named "${PROGRAM_TAG}"`);
  const data = await am.post('/user/getClientList', {
    userID: COACH_TRAINERIZE_ID, view: 'activeClient',
    filter: { userTag: tag.id }, start: 0, count: 100,
  });
  return (data.users || []).some((u) => Number(u.id) === Number(TRAINERIZE_ID));
}

async function run() {
  const commit = process.argv.includes('--commit');
  const client = await loadClient();

  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - ${client.name} (id ${client.id})`);
  console.log(`  active     : ${client.active}`);
  console.log(`  programme  : ${client.program || 'none'}`);
  console.log(`  pending    : ${client.pending_setup}  ->  false`);
  console.log(`  reminders  : ${client.reminders_enabled}`);

  if (!client.active) throw new Error(`${client.name} is not active in the portal.`);
  if (client.program !== PROGRAM) {
    throw new Error(`${client.name} is on ${client.program || 'no programme'}, not ${PROGRAM}. Refusing to guess.`);
  }

  // --- 1. The Trainerize tag has the last word ----------------------------
  const tagged = await hasProgramTag();
  console.log(`  step 1     : Trainerize tag "${PROGRAM_TAG}" present: ${tagged}`);
  if (!tagged) {
    throw new Error(
      `${client.name} is not tagged "${PROGRAM_TAG}" in Trainerize. The nightly reconcile ` +
      `would change his programme out from under this. Tag him in Trainerize first.`
    );
  }

  // --- 2. Clear the pending flag ------------------------------------------
  if (client.pending_setup === false) {
    console.log('  step 2     : already cleared, nothing to change');
  } else if (commit) {
    const { rows } = await pool.query(
      `UPDATE clients SET pending_setup = false WHERE id = $1 AND coach_id = $2
       RETURNING pending_setup`,
      [client.id, COACH_ID]
    );
    console.log(`  step 2     : pending_setup ${rows[0].pending_setup}`);
  } else {
    console.log('  step 2     : would clear pending setup');
  }

  // --- 3. Suppress the stray Monday nudge ---------------------------------
  const existingLog = await pool.query(
    `SELECT sent, skipped_reason FROM reminder_logs
     WHERE coach_id = $1 AND client_id = $2
       AND reminder_type = 'weekly_checkin' AND cycle_start = $3`,
    [COACH_ID, client.id, SKIP_CYCLE]
  );
  if (existingLog.rows.length > 0) {
    console.log(`  step 3     : already logged for ${SKIP_CYCLE}, nothing to change`);
  } else if (commit) {
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, 'weekly_checkin', $3, false, 'new client - first prompt is 2026-09-20')
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, SKIP_CYCLE]
    );
    console.log(`  step 3     : logged as skipped for the ${SKIP_CYCLE} cycle`);
  } else {
    console.log(`  step 3     : would log as skipped for the ${SKIP_CYCLE} cycle`);
  }

  // --- 4. The Sunday prompts ----------------------------------------------
  const tpl = templates.WEEKLY;
  // Sundays strictly after the 13th, so the run opens on the 20th.
  const dates = am.nextSundays(tpl.occurrences, new Date(`${SKIP_CYCLE}T00:00:00Z`));
  if (dates[0] !== FIRST_SUNDAY) {
    throw new Error(`Expected the run to start ${FIRST_SUNDAY}, got ${dates[0]}. Refusing to schedule.`);
  }

  const hh = String(Math.floor(tpl.sendTimeMinutes / 60)).padStart(2, '0');
  const mm = String(tpl.sendTimeMinutes % 60).padStart(2, '0');
  console.log(`  step 4     : ${dates.length} weekly prompts, ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`               "${tpl.title}" at ${hh}:${mm} in his own timezone (${client.timezone})`);
  console.log(`               skipping ${SKIP_CYCLE} as asked`);

  const batchId = `start-weekly-liam-garvey-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const out = await am.scheduleForClient({
    client, dates,
    sendTimeMinutes: tpl.sendTimeMinutes,
    title: tpl.title,
    body: tpl.body,
    kind: 'weekly',
    batchId,
    dryRun: !commit,
  });

  if (out.skipped) {
    console.log(`               SKIPPED: ${out.skipped}`);
  } else if (commit) {
    console.log(`               created ${out.created} messages, ${out.first} to ${out.last}`);
    console.log(`\nRoll back with:  node backend/db/schedule-auto-messages.js --rollback ${batchId}`);
  } else {
    console.log(`               would create ${out.wouldCreate} messages`);
  }

  if (!commit) console.log('\nDry run only. Nothing was written. Re-run with --commit to apply.');
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('FAILED:', err.message);
    pool.end();
    process.exit(1);
  });
