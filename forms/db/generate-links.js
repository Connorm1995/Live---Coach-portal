/**
 * Mint a personal form link token for every active client that does not
 * already have one, then print the full list for sending to clients.
 *
 * Safe to run repeatedly - existing tokens are never changed, so links
 * already sent to clients keep working.
 *
 * Usage: node forms/db/generate-links.js
 */

const crypto = require('crypto');
const pool = require('./pool');

const COACH_ID = 1;
const BASE_URL = process.env.FORMS_BASE_URL || 'https://forms.myfitcoach.ie';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no 0/O/1/l/I

function mintToken(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function run() {
  const clients = await pool.query(
    `SELECT id, name FROM clients WHERE coach_id = $1 AND active = true ORDER BY name`,
    [COACH_ID]
  );

  let created = 0;
  for (const c of clients.rows) {
    const result = await pool.query(
      `INSERT INTO form_links (coach_id, client_id, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (coach_id, client_id) DO NOTHING
       RETURNING token`,
      [COACH_ID, c.id, mintToken()]
    );
    if (result.rows.length > 0) created++;
  }

  console.log(`Minted ${created} new link(s). Full list:\n`);

  const links = await pool.query(
    `SELECT fl.token, c.name
     FROM form_links fl
     JOIN clients c ON c.id = fl.client_id
     WHERE fl.coach_id = $1 AND fl.active = true AND c.active = true
     ORDER BY c.name`,
    [COACH_ID]
  );

  for (const row of links.rows) {
    console.log(`${row.name.padEnd(30)} ${BASE_URL}/checkin/${row.token}`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error('generate-links failed:', err);
  process.exit(1);
});
