#!/usr/bin/env node
/**
 * One-off script: start Stephen Hudson's Sunday check-in prompts.
 *
 * New client, joined 11 Sep 2026. The client.added webhook created his portal
 * record (id 76, trainerize_id 31291692) and it is already correct: active,
 * my_fit_coach, pending_setup false, reminders_enabled true. Nothing was
 * scheduled for him though, so he had no prompts at all.
 *
 * Connor asked on 12 Sep 2026 for his prompts to start NEXT Sunday, the 20th,
 * not tomorrow the 13th, and for the Monday nudge to stay quiet on the 14th.
 *
 * Two things:
 *   1. A reminder_logs row for the 2026-09-13 cycle, so the Monday 7pm nudge
 *      on 14 Sep stays quiet. Without it he WOULD be chased - the query in
 *      processReminders() picks up any active my_fit_coach client with no
 *      check-in and no reminder log for the cycle, and he matches all three.
 *      He would be asked for a check-in he was never prompted to do.
 *   2. 52 weekly auto messages starting Sunday 20 Sep 2026, NOT the 13th.
 *
 * Why a reminder_logs row rather than switching reminders_enabled off and back
 * on: this needs no second step and cannot be forgotten. It suppresses exactly
 * one cycle. His next possible nudge is Monday 21 Sep, the day after his first
 * prompt, which is where it should be.
 *
 * Dry run is the default. Nothing is written without --commit.
 *
 * Idempotent - every step checks its own state first, so re-running reports
 * what is already done and changes nothing.
 *
 * Usage:
 *   node backend/db/start-stephen-hudson-weekly.js
 *   node backend/db/start-stephen-hudson-weekly.js --commit
 *
 * Roll the messages back with the batch id printed at the end:
 *   node backend/db/schedule-auto-messages.js --rollback <batch_id>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');
const am = require('../lib/auto-messages');
const templates = require('../lib/auto-message-templates');

const COACH_ID = 1;
const TRAINERIZE_ID = '31291692';
const PROGRAM = 'my_fit_coach';

// The Sunday his prompts start. Tomorrow, the 13th, is deliberately skipped.
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

async function run() {
  const commit = process.argv.includes('--commit');
  const client = await loadClient();

  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - ${client.name} (id ${client.id})`);
  console.log(`  active     : ${client.active}`);
  console.log(`  programme  : ${client.program || 'none'}`);
  console.log(`  pending    : ${client.pending_setup}`);
  console.log(`  reminders  : ${client.reminders_enabled}`);

  if (!client.active) throw new Error(`${client.name} is not active in the portal.`);
  if (client.program !== PROGRAM) {
    throw new Error(`${client.name} is on ${client.program || 'no programme'}, not ${PROGRAM}. Refusing to guess.`);
  }
  if (client.pending_setup) {
    throw new Error(`${client.name} is still marked pending setup. Finish that first.`);
  }

  // --- 1. Suppress the stray Monday nudge ---------------------------------
  const existingLog = await pool.query(
    `SELECT sent, skipped_reason FROM reminder_logs
     WHERE coach_id = $1 AND client_id = $2
       AND reminder_type = 'weekly_checkin' AND cycle_start = $3`,
    [COACH_ID, client.id, SKIP_CYCLE]
  );
  if (existingLog.rows.length > 0) {
    console.log(`  step 1     : already logged for ${SKIP_CYCLE}, nothing to change`);
  } else if (commit) {
    await pool.query(
      `INSERT INTO reminder_logs (coach_id, client_id, reminder_type, cycle_start, sent, skipped_reason)
       VALUES ($1, $2, 'weekly_checkin', $3, false, 'new client - first prompt is 2026-09-20')
       ON CONFLICT (coach_id, client_id, reminder_type, cycle_start) DO NOTHING`,
      [COACH_ID, client.id, SKIP_CYCLE]
    );
    console.log(`  step 1     : logged as skipped for the ${SKIP_CYCLE} cycle`);
  } else {
    console.log(`  step 1     : would log as skipped for the ${SKIP_CYCLE} cycle`);
  }

  // --- 2. The Sunday prompts ----------------------------------------------
  const tpl = templates.WEEKLY;
  // Sundays strictly after the 13th, so the run opens on the 20th.
  const dates = am.nextSundays(tpl.occurrences, new Date(`${SKIP_CYCLE}T00:00:00Z`));
  if (dates[0] !== FIRST_SUNDAY) {
    throw new Error(`Expected the run to start ${FIRST_SUNDAY}, got ${dates[0]}. Refusing to schedule.`);
  }

  const hh = String(Math.floor(tpl.sendTimeMinutes / 60)).padStart(2, '0');
  const mm = String(tpl.sendTimeMinutes % 60).padStart(2, '0');
  console.log(`  step 2     : ${dates.length} weekly prompts, ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`               "${tpl.title}" at ${hh}:${mm} in his own timezone (${client.timezone})`);
  console.log(`               skipping ${SKIP_CYCLE} as asked`);

  const batchId = `start-weekly-stephen-hudson-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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
