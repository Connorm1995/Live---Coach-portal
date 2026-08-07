/**
 * Investigation: locate Daniel Condren's Trainerize ID and portal DB record.
 * Read-only - does NOT insert anything.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

(async () => {
  const r = await pool.query(
    "SELECT id, name, email, program, active, trainerize_id, trainerize_joined_at FROM clients WHERE lower(name) LIKE '%condren%' OR lower(name) LIKE '%condran%'"
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
