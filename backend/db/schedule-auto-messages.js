#!/usr/bin/env node
/**
 * Schedule Trainerize auto messages for a program's clients.
 *
 * Dry run is the default. Nothing is created without --commit.
 *
 *   node backend/db/schedule-auto-messages.js weekly
 *   node backend/db/schedule-auto-messages.js weekly --commit
 *   node backend/db/schedule-auto-messages.js eom --commit
 *   node backend/db/schedule-auto-messages.js --status
 *   node backend/db/schedule-auto-messages.js --rollback <batch_id>
 *   node backend/db/schedule-auto-messages.js --rollback-client "<name>" weekly
 *
 * Safety properties:
 *  - Idempotent. A client who already has live future messages of this kind is
 *    skipped, so re-running can never stack a second year on top.
 *  - Every created id is written to `auto_messages` immediately. Because auto
 *    messages cannot be listed through the API, that table is the only record
 *    they exist - it is what --rollback reads.
 *  - --rollback only ever deletes ids this tool created and recorded.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');
const am = require('../lib/auto-messages');
const templates = require('../lib/auto-message-templates');

const COACH_ID = 1;
const PROGRAM_FOR_KIND = {
  weekly: 'my_fit_coach',
  eom: 'my_fit_coach_core',
};

function newBatchId(kind) {
  return `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

async function recipients(kind) {
  const { rows } = await pool.query(
    `SELECT id, name, trainerize_id, timezone
     FROM clients
     WHERE coach_id = $1 AND active = true AND program = $2
     ORDER BY name`,
    [COACH_ID, PROGRAM_FOR_KIND[kind]]
  );
  return rows;
}

async function showStatus() {
  const { rows } = await pool.query(
    `SELECT c.name, a.kind, count(*)::int AS live,
            min(a.send_date) AS next, max(a.send_date) AS last
     FROM auto_messages a
     JOIN clients c ON c.id = a.client_id
     WHERE a.coach_id = $1 AND a.deleted_at IS NULL AND a.send_date >= CURRENT_DATE
     GROUP BY c.name, a.kind
     ORDER BY a.kind, c.name`,
    [COACH_ID]
  );
  if (rows.length === 0) {
    console.log('No auto messages scheduled.');
    return;
  }
  console.log('Client                      Kind    Live  Next        Last');
  console.log('-'.repeat(66));
  for (const r of rows) {
    console.log(
      r.name.padEnd(28) + r.kind.padEnd(8) +
      String(r.live).padStart(4) + '  ' +
      String(r.next).slice(0, 10) + '  ' + String(r.last).slice(0, 10)
    );
  }

  const batches = await pool.query(
    `SELECT batch_id, count(*)::int AS n, min(created_at) AS at
     FROM auto_messages WHERE coach_id = $1 AND deleted_at IS NULL
     GROUP BY batch_id ORDER BY min(created_at) DESC LIMIT 10`,
    [COACH_ID]
  );
  console.log('\nBatches (for --rollback):');
  for (const b of batches.rows) {
    console.log(`  ${b.batch_id}  ${String(b.n).padStart(4)} messages  ${new Date(b.at).toISOString().slice(0, 16)}`);
  }
}

async function run() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');

  if (args.includes('--status')) return showStatus();

  const rbIdx = args.indexOf('--rollback');
  if (rbIdx !== -1) {
    const batchId = args[rbIdx + 1];
    if (!batchId) throw new Error('--rollback needs a batch id (see --status)');
    const res = await am.rollbackBatch(batchId);
    console.log(`Rolled back ${res.deleted}/${res.total} messages from ${batchId}`);
    if (res.failures.length) console.log('Failures:', res.failures);
    return;
  }

  const rbcIdx = args.indexOf('--rollback-client');
  if (rbcIdx !== -1) {
    const name = args[rbcIdx + 1];
    const kind = args.find((a) => a === 'weekly' || a === 'eom');
    if (!name || !kind) throw new Error('--rollback-client needs a client name and a kind');
    const { rows } = await pool.query(
      `SELECT id, name FROM clients WHERE coach_id = $1 AND name = $2`, [COACH_ID, name]
    );
    if (!rows[0]) throw new Error(`No client named "${name}"`);
    const res = await am.rollbackClient(rows[0].id, kind);
    console.log(`Rolled back ${res.deleted}/${res.total} ${kind} messages for ${rows[0].name}`);
    if (res.failures.length) console.log('Failures:', res.failures);
    return;
  }

  const kind = args.find((a) => a === 'weekly' || a === 'eom');
  if (!kind) {
    console.log('Usage: schedule-auto-messages.js <weekly|eom> [--commit]');
    console.log('       schedule-auto-messages.js --status');
    console.log('       schedule-auto-messages.js --rollback <batch_id>');
    return;
  }

  const tpl = kind === 'weekly' ? templates.WEEKLY : templates.EOM;
  const dates = kind === 'weekly'
    ? am.nextSundays(tpl.occurrences)
    : am.nextLastSaturdays(tpl.occurrences);
  const clients = await recipients(kind);
  const batchId = newBatchId(kind);

  const hh = String(Math.floor(tpl.sendTimeMinutes / 60)).padStart(2, '0');
  const mm = String(tpl.sendTimeMinutes % 60).padStart(2, '0');

  console.log(`${commit ? 'SCHEDULING' : 'DRY RUN'} - ${kind} auto messages`);
  console.log(`  title      : ${tpl.title}`);
  console.log(`  send time  : ${hh}:${mm} in each client's own timezone`);
  console.log(`  occurrences: ${dates.length}  (${dates[0]} to ${dates[dates.length - 1]})`);
  console.log(`  recipients : ${clients.length}`);
  console.log(`  batch id   : ${batchId}`);
  console.log('');

  let created = 0;
  let skipped = 0;
  const failures = [];

  for (const client of clients) {
    try {
      const res = await am.scheduleForClient({
        client, dates,
        sendTimeMinutes: tpl.sendTimeMinutes,
        title: tpl.title,
        body: tpl.body,
        kind, batchId, dryRun: !commit,
      });
      if (res.skipped) {
        skipped++;
        console.log(`  SKIP  ${client.name.padEnd(26)} ${res.skipped}`);
      } else if (commit) {
        created += res.created;
        console.log(`  OK    ${client.name.padEnd(26)} ${res.created} messages, ${res.first} to ${res.last}`);
      } else {
        console.log(`  would ${client.name.padEnd(26)} ${res.wouldCreate} messages, ${res.first} to ${res.last}`);
      }
    } catch (err) {
      failures.push({ client: client.name, error: err.message });
      console.error(`  FAIL  ${client.name.padEnd(26)} ${err.message}`);
    }
  }

  console.log('');
  if (commit) {
    console.log(`Done. ${created} messages created, ${skipped} clients skipped, ${failures.length} failed.`);
    console.log(`Roll back with:  node backend/db/schedule-auto-messages.js --rollback ${batchId}`);
  } else {
    console.log(`Dry run only. ${skipped} clients would be skipped. Re-run with --commit to schedule.`);
  }
  if (failures.length) console.log('Failures:', failures);
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Failed:', err.message);
    pool.end();
    process.exit(1);
  });
