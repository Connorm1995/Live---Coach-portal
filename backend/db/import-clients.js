/**
 * One-time import: fetch active Trainerize clients for coach 5343380
 * and insert them into the portal database.
 *
 * Usage:  node backend/db/import-clients.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

const COACH_TRAINERIZE_ID = 5343380; // Your Trainerize trainer/coach ID
const COACH_ID = 1;                  // Portal coach_id (single-coach setup)
const PAGE_SIZE = 100;

// Tag name → program value
const TAG_PROGRAM_MAP = {
  'Connor - MyFitCoach':      'my_fit_coach',
  'Connor - Core MyFitCoach': 'my_fit_coach_core',
};

// ── Trainerize helpers ──────────────────────────────────────────────

async function trainerizePost(endpoint, body) {
  const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trainerize ${endpoint} responded ${res.status}: ${text}`);
  }
  return res.json();
}

/** Fetch all active clients for our coach, paginated. */
async function fetchAllActiveClients() {
  const clients = [];
  let start = 0;

  while (true) {
    const data = await trainerizePost('/user/getClientList', {
      userID: COACH_TRAINERIZE_ID,
      view: 'activeClient',
      start,
      count: PAGE_SIZE,
    });

    const users = data.users || [];
    clients.push(...users);

    if (users.length < PAGE_SIZE || clients.length >= (data.total || Infinity)) break;
    start += PAGE_SIZE;
  }

  return clients;
}

/** Get all user tags and return a map of tagId → tagName. */
async function fetchTagList() {
  const data = await trainerizePost('/userTag/getList', {});
  const tags = data.userTags || [];
  const map = {};
  for (const t of tags) {
    map[t.id] = t.name;
  }
  return { tags, map };
}

/** Fetch active clients filtered by a specific tag ID. Returns a Set of userIDs. */
async function fetchClientIdsByTag(tagId) {
  const ids = new Set();
  let start = 0;

  while (true) {
    const data = await trainerizePost('/user/getClientList', {
      userID: COACH_TRAINERIZE_ID,
      view: 'activeClient',
      filter: { userTag: tagId },
      start,
      count: PAGE_SIZE,
    });

    const users = data.users || [];
    for (const u of users) ids.add(u.id);

    if (users.length < PAGE_SIZE || ids.size >= (data.total || Infinity)) break;
    start += PAGE_SIZE;
  }

  return ids;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Trainerize Client Import ===\n');

  // 1. Fetch tag list and identify our two program tags
  console.log('Fetching tag list…');
  const { tags, map: tagNameById } = await fetchTagList();

  const tagIdByProgram = {}; // program → tagId
  for (const t of tags) {
    if (TAG_PROGRAM_MAP[t.name]) {
      tagIdByProgram[TAG_PROGRAM_MAP[t.name]] = t.id;
      console.log(`  Found tag "${t.name}" (id=${t.id}) → ${TAG_PROGRAM_MAP[t.name]}`);
    }
  }

  // 2. For each program tag, fetch the set of client IDs that have it
  const programByUserId = {}; // trainerize userId → program
  for (const [program, tagId] of Object.entries(tagIdByProgram)) {
    console.log(`Fetching clients with tag id=${tagId} (${program})…`);
    const ids = await fetchClientIdsByTag(tagId);
    for (const id of ids) {
      programByUserId[id] = program;
    }
    console.log(`  → ${ids.size} clients`);
  }

  // 3. Fetch all active clients
  console.log('Fetching all active clients…');
  const clients = await fetchAllActiveClients();
  console.log(`  → ${clients.length} active clients found\n`);

  // 4. Insert into database
  let imported = 0;
  let skipped = 0;

  for (const c of clients) {
    const trainerizeId = String(c.id);
    const name = `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim();
    const email = (c.email || '').toLowerCase() || null;
    const program = programByUserId[c.id] || null;

    if (!name) {
      console.warn(`  SKIP (no name): id=${c.id}`);
      skipped++;
      continue;
    }

    // Dedup on trainerize_id
    const existing = await pool.query(
      `SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
      [trainerizeId, COACH_ID]
    );

    if (existing.rows.length > 0) {
      console.log(`  SKIP (exists): ${name} (trainerize_id=${trainerizeId})`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO clients (coach_id, trainerize_id, name, email, program, pending_setup, active)
       VALUES ($1, $2, $3, $4, $5, false, true)`,
      [COACH_ID, trainerizeId, name, email, program]
    );

    console.log(`  IMPORTED: ${name} | ${email || '(no email)'} | program=${program || '(none)'}`);
    imported++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Total fetched from Trainerize: ${clients.length}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
