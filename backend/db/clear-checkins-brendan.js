/**
 * clear-checkins-brendan.js
 *
 * Removes only the seeded check-ins for Brendan Smartt.
 * Targets rows by their typeform_response_id prefix.
 *
 * Usage: node backend/db/clear-checkins-brendan.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function clear() {
  try {
    const result = await pool.query(
      `DELETE FROM checkins WHERE typeform_response_id LIKE 'seed-brendan-week-%' RETURNING id`
    );

    console.log(`Removed ${result.rowCount} seeded check-ins for Brendan Smartt.`);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clear();
