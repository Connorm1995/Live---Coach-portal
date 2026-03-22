/**
 * clear-seed.js
 *
 * Safely removes all seed/test data from the clients and checkins tables.
 * Deletes checkins first (FK dependency on clients), then clients.
 * Resets the auto-increment sequences so IDs start fresh.
 *
 * Usage:
 *   node backend/db/clear-seed.js
 *   node backend/db/clear-seed.js --dry-run   (preview without deleting)
 */

const pool = require('./pool');

const DRY_RUN = process.argv.includes('--dry-run');

async function clearSeed() {
  const client = await pool.connect();
  try {
    // Preview counts before deleting
    const checkinCount = await client.query('SELECT COUNT(*) AS count FROM checkins');
    const clientCount = await client.query('SELECT COUNT(*) AS count FROM clients');

    console.log(`Found ${checkinCount.rows[0].count} checkins and ${clientCount.rows[0].count} clients.`);

    if (DRY_RUN) {
      console.log('[DRY RUN] No data was deleted. Remove --dry-run to execute.');
      return;
    }

    if (checkinCount.rows[0].count === '0' && clientCount.rows[0].count === '0') {
      console.log('Tables are already empty — nothing to clear.');
      return;
    }

    await client.query('BEGIN');

    // Delete checkins first (foreign key references clients)
    const deletedCheckins = await client.query('DELETE FROM checkins RETURNING id');
    console.log(`Deleted ${deletedCheckins.rowCount} checkins.`);

    // Delete clients
    const deletedClients = await client.query('DELETE FROM clients RETURNING id');
    console.log(`Deleted ${deletedClients.rowCount} clients.`);

    // Reset ID sequences so the next insert starts at 1
    await client.query(`ALTER SEQUENCE clients_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE checkins_id_seq RESTART WITH 1`);
    console.log('ID sequences reset to 1.');

    await client.query('COMMIT');
    console.log('\nSeed data cleared successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Clear failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearSeed();
