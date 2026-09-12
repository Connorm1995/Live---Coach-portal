#!/usr/bin/env node
/**
 * One-off script: move Sean McGrath from MyFitCoach to MyFitCoach Core.
 *
 * Connor moved him from the high ticket programme to the low ticket Core
 * option on 4 Sep 2026. He had already been re-tagged in Trainerize as
 * "Connor - Core MyFitCoach"; the portal had not caught up, so he was still
 * on my_fit_coach with 47 future Sunday prompts scheduled.
 *
 * Three things, in order:
 *   1. Confirm the Trainerize tag really says Core. reconcileClients() in
 *      lib/scheduler.js treats the tag as the source of truth and rewrites
 *      clients.program from it once a day. Flipping the portal against a
 *      stale tag would simply be undone overnight, so this refuses to run
 *      rather than start a fight it loses.
 *   2. program = 'my_fit_coach_core'. Everything downstream keys off this one
 *      column: the Sunday nudge query in processReminders() stops matching
 *      him, the EOM deadline nudge starts, the Check-in Hub moves him to the
 *      Core list and Client View starts reading his check-ins as eom_report.
 *   3. Swap the messages - remove his 47 future weekly prompts, create 12
 *      monthly EOM prompts. Past prompts he already received are left alone;
 *      they are a true record of what was sent.
 *
 *   4. reminders_enabled = true. Connor asked on 4 Sep 2026 for him to be
 *      chased if the EOM report is not in. It had been false since before the
 *      move, which would have swallowed the nudge silently: sendReminderDM()
 *      logs it as skipped rather than sending.
 *
 * There is no per-type reminder switch, and none is needed. reminders_enabled
 * only decides WHETHER a client is chased; clients.program decides WHICH nudge
 * they are eligible for, because the two queries in processReminders() select
 * on programme and nothing else. Once he is on Core he cannot receive the
 * Sunday weekly nudge - he is not in that query's result set at all - and he
 * becomes eligible for the EOM one on the deadline Monday, two days after the
 * prompt, at 7pm in his own timezone.
 *
 * Dry run is the default. Nothing is written without --commit.
 *
 * Idempotent - every step checks its own state first, so re-running reports
 * what is already done and changes nothing.
 *
 * Usage:
 *   node backend/db/switch-sean-mcgrath-to-core.js
 *   node backend/db/switch-sean-mcgrath-to-core.js --commit
 *
 * Roll the new messages back with the batch id printed at the end:
 *   node backend/db/schedule-auto-messages.js --rollback <batch_id>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');
const am = require('../lib/auto-messages');
const templates = require('../lib/auto-message-templates');

const COACH_ID = 1;
const COACH_TRAINERIZE_ID = 5343380;
const TRAINERIZE_ID = '21780162';
const FROM_PROGRAM = 'my_fit_coach';
const TO_PROGRAM = 'my_fit_coach_core';
const CORE_TAG = 'Connor - Core MyFitCoach';
// Connor, 4 Sep 2026: chase him if the EOM report is not in.
const WANT_REMINDERS = true;

async function loadClient() {
  const { rows } = await pool.query(
    `SELECT id, name, trainerize_id, timezone, program, active, reminders_enabled
     FROM clients WHERE coach_id = $1 AND trainerize_id = $2`,
    [COACH_ID, TRAINERIZE_ID]
  );
  if (rows.length === 0) throw new Error(`No client with trainerize_id ${TRAINERIZE_ID}`);
  if (rows.length > 1) throw new Error(`${rows.length} clients share trainerize_id ${TRAINERIZE_ID}`);
  return rows[0];
}

/** Is this client carrying the Core tag in Trainerize right now? */
async function hasCoreTag() {
  const tagList = await am.post('/userTag/getList', {});
  const tag = (tagList.userTags || []).find((t) => t.name === CORE_TAG);
  if (!tag) throw new Error(`Trainerize has no tag named "${CORE_TAG}"`);
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
  console.log(`  programme  : ${client.program || 'none'}  ->  ${TO_PROGRAM}`);
  console.log(`  reminders  : ${client.reminders_enabled}  ->  ${WANT_REMINDERS}`);

  if (!client.active) throw new Error(`${client.name} is not active in the portal.`);
  if (client.program !== FROM_PROGRAM && client.program !== TO_PROGRAM) {
    throw new Error(`${client.name} is on ${client.program || 'no programme'}, not ${FROM_PROGRAM}. Refusing to guess.`);
  }

  // --- 1. The Trainerize tag has the last word -----------------------------
  const tagged = await hasCoreTag();
  console.log(`  step 1     : Trainerize tag "${CORE_TAG}" present: ${tagged}`);
  if (!tagged) {
    throw new Error(
      `${client.name} is not tagged "${CORE_TAG}" in Trainerize. The daily reconcile ` +
      `would put him back on ${FROM_PROGRAM} within a day. Re-tag him in Trainerize first.`
    );
  }

  // --- 2. Programme --------------------------------------------------------
  // Programme and reminder flag move together. Setting one without the other
  // is exactly the half-done state this script exists to avoid: on Core but
  // never chased, or chased while still counted as a weekly client.
  const needsProgram = client.program !== TO_PROGRAM;
  const needsReminders = client.reminders_enabled !== WANT_REMINDERS;
  if (!needsProgram && !needsReminders) {
    console.log('  step 2     : already on Core with reminders on, nothing to change');
  } else if (commit) {
    const { rows } = await pool.query(
      `UPDATE clients SET program = $1, reminders_enabled = $2
       WHERE id = $3 AND coach_id = $4
       RETURNING program, reminders_enabled`,
      [TO_PROGRAM, WANT_REMINDERS, client.id, COACH_ID]
    );
    console.log(`  step 2     : set to ${rows[0].program}, reminders_enabled ${rows[0].reminders_enabled}`);
  } else {
    console.log(`  step 2     : would set programme to ${TO_PROGRAM} and reminders_enabled to ${WANT_REMINDERS}`);
  }

  // --- 3a. Remove the future Sunday prompts --------------------------------
  const staleWeekly = await am.liveCountFor(client.id, 'weekly');
  if (staleWeekly === 0) {
    console.log('  step 3a    : no future weekly prompts to remove');
  } else if (commit) {
    const res = await am.rollbackClient(client.id, 'weekly', { futureOnly: true });
    console.log(`  step 3a    : removed ${res.deleted}/${res.total} future weekly prompts`);
    if (res.failures.length) console.log('               removal failures:', res.failures);
  } else {
    console.log(`  step 3a    : would remove ${staleWeekly} future weekly prompts (past ones kept)`);
  }

  // --- 3b. Create the monthly EOM prompts ----------------------------------
  const tpl = templates.EOM;
  const adjusted = am.applyEomExceptions(am.nextLastSaturdays(tpl.occurrences));
  const { dates, bodyByDate, applied } = adjusted;

  const hh = String(Math.floor(tpl.sendTimeMinutes / 60)).padStart(2, '0');
  const mm = String(tpl.sendTimeMinutes % 60).padStart(2, '0');
  console.log(`  step 3b    : ${dates.length} EOM prompts, ${dates[0]} to ${dates[dates.length - 1]}`);
  console.log(`               "${tpl.title}" at ${hh}:${mm} in his own timezone (${client.timezone})`);
  for (const ex of applied) {
    console.log(`               exception: ${ex.from} -> ${ex.to}, custom wording (${ex.reason})`);
  }

  const batchId = `switch-eom-sean-mcgrath-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const out = await am.scheduleForClient({
    client, dates,
    sendTimeMinutes: tpl.sendTimeMinutes,
    title: tpl.title,
    body: tpl.body,
    bodyByDate,
    kind: 'eom',
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
