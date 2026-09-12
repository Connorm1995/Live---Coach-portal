#!/usr/bin/env node
/**
 * One-off script: finish setting Gavin Bluett back up after his return.
 *
 * He was deactivated in Trainerize and came back on board on 4 Sep 2026. The
 * client.added webhook recreated his portal record that morning (id 73,
 * trainerize_id 5918879, active = true), but the webhook always inserts with
 * program = NULL and pending_setup = true, so he was left half set up.
 *
 * An empty programme is silent, not loud: recipients() in
 * schedule-auto-messages.js and processReminders() in lib/scheduler.js both
 * filter on program, and findMissingSchedules() only looks at clients who
 * already have one. He would have got no Sunday prompt, no Monday nudge, and
 * never appeared in --status as missing.
 *
 * Three things, in order:
 *   1. program = 'my_fit_coach', pending_setup = false. Connor confirmed the
 *      programme on 4 Sep 2026 rather than relying on the Trainerize tag.
 *   2. A reminder_logs row for the 2026-09-06 cycle, so the Monday 7pm nudge
 *      on 7 Sep stays quiet. Without it he would be chased for a check-in he
 *      was never sent, because his first Sunday prompt is the 13th.
 *   3. 52 weekly auto messages starting Sunday 13 Sep 2026, NOT the 6th.
 *      Connor asked for the following Sunday, so this skips one week rather
 *      than scheduling from the next Sunday like --switch would.
 *
 * Dry run is the default. Nothing is written without --commit.
 *
 * Idempotent - every step checks its own state first, so re-running reports
 * what is already done and changes nothing.
 *
 * Usage:
 *   node backend/db/reactivate-gavin-bluett.js
 *   node backend/db/reactivate-gavin-bluett.js --commit
 *
 * Roll back the messages with the batch id printed at the end:
 *   node backend/db/schedule-auto-messages.js --rollback <batch_id>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');
const am = require('../lib/auto-messages');
const templates = require('../lib/auto-message-templates');

const COACH_ID = 1;
const TRAINERIZE_ID = '5918879';
const PROGRAM = 'my_fit_coach';

// The Sunday his prompts start. The week of the 6th is deliberately skipped.
const FIRST_SUNDAY = '2026-09-13';
// The cycle the skipped week belongs to, as getCurrentCycleSunday() would
// return it on Monday 7 Sep. Suppresses that Monday's 7pm nudge only.
const SKIP_CYCLE = '2026-09-06';

async function loadClient() {
  const { rows } = await pool.query(
    `SELECT id, name, trainerize_id, timezone, program, pending_setup, active
     FROM clients WHERE coach_id = $1 AND trainerize_id = $2`,
    [COACH_ID, TRAINERIZE_ID]
  );
  if (rows.length === 0) throw new Error(`No client with trainerize_id ${TRAINERIZE_ID}`);
  if (rows.length > 1) throw new Error(`${rows.length} clients share trainerize_id ${TRAINERIZE_ID}`);
  return rows[0];
}

async function run() {
  const commit = process.argv.includes('--commit');
  const client = await loadClient();

  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - ${client.name} (id ${client.id})`);
  console.log(`  active     : ${client.active}`);
  console.log(`  programme  : ${client.program || 'none'}  ->  ${PROGRAM}`);
  console.log(`  pending    : ${client.pending_setup}  ->  false`);

  if (!client.active) {
    throw new Error(`${client.name} is not active in the portal. Reactivate him first.`);
  }
  if (client.program && client.program !== PROGRAM) {
    throw new Error(
      `${client.name} is already on ${client.program}, not ${PROGRAM}. ` +
      `Use schedule-auto-messages.js --switch instead of this script.`
    );
  }

  // --- 1. Programme -------------------------------------------------------
  if (client.program === PROGRAM && client.pending_setup === false) {
    console.log('  step 1     : already set, nothing to change');
  } else if (commit) {
    const { rows } = await pool.query(
      `UPDATE clients SET program = $1, pending_setup = false
       WHERE id = $2 AND coach_id = $3
       RETURNING program, pending_setup`,
      [PROGRAM, client.id, COACH_ID]
    );
    console.log(`  step 1     : set to ${rows[0].program}, pending_setup ${rows[0].pending_setup}`);
  } else {
    console.log('  step 1     : would set programme and clear pending setup');
  }

  // --- 2. Suppress the stray Monday nudge ---------------------------------
  const existingLog = await pool.query(
    `SELECT sent, skipped_reason FROM reminder_logs
     WHERE coach_id = $1 AND client_id = $2
       AND reminder_type = 'weekly_checkin' AND cycle_start = $3`,
    [COACH_ID, client.id, SKIP_CYCLE]
  );
  if (existingLog.rows.length > 0) {
    console.log(`  step 2     : already logged for ${SKIP_CYCLE}, nothing to change`);
  } else if (commit) {
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, 'weekly_checkin', $3, false, 'restarting - first prompt is 2026-09-13')
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, SKIP_CYCLE]
    );
    console.log(`  step 2     : logged as skipped for the ${SKIP_CYCLE} cycle`);
  } else {
    console.log(`  step 2     : would log as skipped for the ${SKIP_CYCLE} cycle`);
  }

  // --- 3. The Sunday prompts ----------------------------------------------
  const tpl = templates.WEEKLY;
  // Sundays strictly after the 6th, so the run opens on the 13th.
  const dates = am.nextSundays(tpl.occurrences, new Date(`${SKIP_CYCLE}T00:00:00Z`));
  if (dates[0] !== FIRST_SUNDAY) {
    throw new Error(`Expected the run to start ${FIRST_SUNDAY}, got ${dates[0]}. Refusing to schedule.`);
  }

  const hh = String(Math.floor(tpl.sendTimeMinutes / 60)).padStart(2, '0');
  const mm = String(tpl.sendTimeMinutes % 60).padStart(2, '0');
  console.log(`  step 3     : ${dates.length} weekly prompts, ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`               "${tpl.title}" at ${hh}:${mm} in his own timezone (${client.timezone})`);
  console.log(`               skipping ${SKIP_CYCLE} as asked`);

  const batchId = `restart-weekly-gavin-bluett-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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
