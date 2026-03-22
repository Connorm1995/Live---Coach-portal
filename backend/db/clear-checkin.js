/**
 * clear-checkin.js
 *
 * Removes check-ins created by seed-checkin.js for Brendan Smartt (client id 4).
 *
 * Safe by design:
 *   - Primarily targets the known seed token (typeform_response_id = seed-checkin-brendan-smartt-001)
 *   - As a fallback, also offers to delete the single most recent check-in for this
 *     client if the seed token row is not found (e.g. if the token was changed).
 *   - Prints what it found before deleting and confirms the result.
 *
 * Usage: node backend/db/clear-checkin.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');

const CLIENT_ID = 4;
const SEED_TOKEN = 'seed-checkin-brendan-smartt-001';

async function clearCheckin() {
  console.log('[clear-checkin] Looking for seed check-in rows for client id', CLIENT_ID);

  // First try: delete by the known seed token (precise, safe)
  const byToken = await pool.query(
    `SELECT id, client_id, type, typeform_response_id, submitted_at, cycle_start
     FROM checkins
     WHERE typeform_response_id = $1 AND client_id = $2`,
    [SEED_TOKEN, CLIENT_ID]
  );

  if (byToken.rows.length > 0) {
    const row = byToken.rows[0];
    console.log('[clear-checkin] Found seeded check-in by token:');
    console.log(`  id:                   ${row.id}`);
    console.log(`  client_id:            ${row.client_id}`);
    console.log(`  type:                 ${row.type}`);
    console.log(`  typeform_response_id: ${row.typeform_response_id}`);
    console.log(`  submitted_at:         ${row.submitted_at}`);
    console.log(`  cycle_start:          ${row.cycle_start}`);

    const deleteResult = await pool.query(
      `DELETE FROM checkins WHERE typeform_response_id = $1 AND client_id = $2 RETURNING id`,
      [SEED_TOKEN, CLIENT_ID]
    );

    console.log(`[clear-checkin] Deleted ${deleteResult.rowCount} row(s) with token "${SEED_TOKEN}".`);
    console.log('[clear-checkin] Done.');
    await pool.end();
    return;
  }

  // Fallback: no seed token row found - show the most recent check-in and ask
  // whether to delete it. We use a conservative approach: only delete the
  // single most recent row and only when it was clearly a test (submitted today).
  console.log(`[clear-checkin] No row found with token "${SEED_TOKEN}".`);
  console.log('[clear-checkin] Checking most recent check-in for this client...');

  const recent = await pool.query(
    `SELECT id, client_id, type, typeform_response_id, submitted_at, cycle_start
     FROM checkins
     WHERE client_id = $1
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [CLIENT_ID]
  );

  if (recent.rows.length === 0) {
    console.log('[clear-checkin] No check-ins found for client id', CLIENT_ID, '- nothing to delete.');
    await pool.end();
    return;
  }

  const row = recent.rows[0];
  console.log('[clear-checkin] Most recent check-in:');
  console.log(`  id:                   ${row.id}`);
  console.log(`  client_id:            ${row.client_id}`);
  console.log(`  type:                 ${row.type}`);
  console.log(`  typeform_response_id: ${row.typeform_response_id}`);
  console.log(`  submitted_at:         ${row.submitted_at}`);
  console.log(`  cycle_start:          ${row.cycle_start}`);

  // Safety check: only auto-delete if the row was submitted today
  const submittedDate = new Date(row.submitted_at).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  if (submittedDate !== today) {
    console.warn('[clear-checkin] The most recent check-in was NOT submitted today.');
    console.warn('[clear-checkin] To avoid deleting real data, this script will not auto-delete it.');
    console.warn('[clear-checkin] If you want to remove it, delete it manually:');
    console.warn(`  DELETE FROM checkins WHERE id = ${row.id};`);
    await pool.end();
    return;
  }

  // Submitted today - safe to treat as a seed row and delete
  console.log('[clear-checkin] Row was submitted today. Treating as a seed row and deleting...');
  const deleteResult = await pool.query(
    `DELETE FROM checkins WHERE id = $1 RETURNING id`,
    [row.id]
  );

  console.log(`[clear-checkin] Deleted ${deleteResult.rowCount} row(s) (id=${row.id}).`);
  console.log('[clear-checkin] Done.');

  await pool.end();
}

clearCheckin().catch((err) => {
  console.error('[clear-checkin] Unexpected error:', err.message);
  process.exit(1);
});
