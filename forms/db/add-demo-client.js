/**
 * Create (or remove) a throwaway demo client and print their form links.
 *
 * For showing MyFitCoach Forms to someone without touching a real client and
 * without going anywhere near Trainerize - the demo client has no
 * trainerize_id, so nothing syncs and no welcome mail is sent.
 *
 * Usage:
 *   node forms/db/add-demo-client.js "Sally Demo"       create + print links
 *   node forms/db/add-demo-client.js "Sally Demo" --remove
 *
 * --remove deletes the demo client and everything keyed to them (drafts,
 * link, submitted check-ins). It refuses to touch any client that has a
 * trainerize_id, so it can only ever remove a demo row.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const { mintToken } = require('../lib/tokens');

const COACH_ID = 1;
const BASE_URL = process.env.FORMS_BASE_URL || 'https://forms.myfitcoach.ie';

const name = process.argv[2];
const remove = process.argv.includes('--remove');

if (!name) {
  console.error('Usage: node forms/db/add-demo-client.js "<name>" [--remove]');
  process.exit(1);
}

async function findDemo() {
  const result = await pool.query(
    `SELECT id, trainerize_id FROM clients WHERE coach_id = $1 AND name = $2`,
    [COACH_ID, name]
  );
  return result.rows[0] || null;
}

async function create() {
  let client = await findDemo();

  if (client) {
    console.log(`Client "${name}" already exists (id=${client.id}) - reusing.`);
    await pool.query(`UPDATE clients SET active = true WHERE id = $1`, [client.id]);
  } else {
    const ins = await pool.query(
      `INSERT INTO clients (coach_id, name, program, active, pending_setup)
       VALUES ($1, $2, 'my_fit_coach', true, false)
       RETURNING id`,
      [COACH_ID, name]
    );
    client = { id: ins.rows[0].id };
    console.log(`Created demo client "${name}" (id=${client.id}).`);
  }

  const link = await pool.query(
    `INSERT INTO form_links (coach_id, client_id, token)
     VALUES ($1, $2, $3)
     ON CONFLICT (coach_id, client_id) DO UPDATE SET active = true
     RETURNING token`,
    [COACH_ID, client.id, mintToken()]
  );
  const token = link.rows[0].token;

  console.log(`\nWeekly check-in:  ${BASE_URL}/checkin/${token}`);
  console.log(`End of Month:     ${BASE_URL}/monthly/${token}`);
  console.log(`\nWhen you are done:`);
  console.log(`  node forms/db/add-demo-client.js "${name}" --remove`);
}

async function destroy() {
  const client = await findDemo();
  if (!client) {
    console.log(`No client named "${name}" - nothing to do.`);
    return;
  }
  if (client.trainerize_id) {
    console.error(`REFUSING: "${name}" (id=${client.id}) has trainerize_id=${client.trainerize_id}.`);
    console.error('This script only removes demo clients that were never in Trainerize.');
    process.exit(1);
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`DELETE FROM form_drafts WHERE client_id = $1`, [client.id]);
    await db.query(`DELETE FROM form_links  WHERE client_id = $1`, [client.id]);
    const checkins = await db.query(`DELETE FROM checkins WHERE client_id = $1`, [client.id]);
    await db.query(`DELETE FROM clients WHERE id = $1`, [client.id]);
    await db.query('COMMIT');
    console.log(`Removed "${name}" (id=${client.id}) and ${checkins.rowCount} check-in(s).`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

(remove ? destroy() : create())
  .then(() => pool.end())
  .catch((err) => {
    console.error('Failed:', err.message);
    pool.end();
    process.exit(1);
  });
