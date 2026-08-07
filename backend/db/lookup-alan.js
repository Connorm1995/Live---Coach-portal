/**
 * Investigation: locate Alan Flannery in Trainerize, determine his program
 * tag(s), join date, and whether he already exists in the portal DB.
 * Read-only - does NOT insert anything.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');
const COACH_TRAINERIZE_ID = 5343380;
const COACH_ID = 1;
const PAGE_SIZE = 100;

const TAG_PROGRAM_MAP = {
  'Connor - MyFitCoach':      'my_fit_coach',
  'Connor - Core MyFitCoach': 'my_fit_coach_core',
};

async function tz(endpoint, body) {
  const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: AUTH },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function findInView(view) {
  let start = 0;
  while (true) {
    const data = await tz('/user/getClientList', { userID: COACH_TRAINERIZE_ID, view, start, count: PAGE_SIZE });
    const users = data.users || [];
    for (const u of users) {
      const full = `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim().toLowerCase();
      if (full === 'alan flannery') return u;
    }
    if (users.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return null;
}

async function tagIdsForUser(userId) {
  // Resolve program tag IDs, then check which tagged-client sets include this user
  const tagList = await tz('/userTag/getList', {});
  const tags = tagList.userTags || [];
  const found = [];
  for (const t of tags) {
    if (!TAG_PROGRAM_MAP[t.name]) continue;
    let start = 0; let has = false;
    while (true) {
      const data = await tz('/user/getClientList', {
        userID: COACH_TRAINERIZE_ID, view: 'activeClient', filter: { userTag: t.id }, start, count: PAGE_SIZE,
      });
      const users = data.users || [];
      if (users.some(u => u.id === userId)) { has = true; break; }
      if (users.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
    if (has) found.push({ tag: t.name, program: TAG_PROGRAM_MAP[t.name] });
  }
  return found;
}

(async () => {
  console.log('Searching activeClient view...');
  let user = await findInView('activeClient');
  let view = 'activeClient';
  if (!user) { console.log('Not in activeClient, trying allClient...'); user = await findInView('allClient'); view = 'allClient'; }

  if (!user) {
    console.log('Alan Flannery NOT found in Trainerize (activeClient or allClient).');
    await pool.end();
    return;
  }

  console.log('\n=== Trainerize record ===');
  console.log('found in view :', view);
  console.log('userID        :', user.id);
  console.log('name          :', user.firstName, user.lastName);
  console.log('email         :', user.email);
  console.log('all fields    :', JSON.stringify(user, null, 2));

  console.log('\n=== Program tags ===');
  try {
    const tags = await tagIdsForUser(user.id);
    console.log(tags.length ? tags : '(no MyFitCoach / Core MyFitCoach tag found)');
  } catch (e) {
    console.log('tag lookup error:', e.message);
  }

  console.log('\n=== Portal DB ===');
  const byTid = await pool.query('SELECT id, name, email, program, active, pending_setup, trainerize_joined_at FROM clients WHERE trainerize_id = $1 AND coach_id = $2', [String(user.id), COACH_ID]);
  const byEmail = user.email ? await pool.query('SELECT id, name, email, program, active, pending_setup, trainerize_id FROM clients WHERE lower(email) = lower($1) AND coach_id = $2', [user.email, COACH_ID]) : { rows: [] };
  console.log('match by trainerize_id:', byTid.rows);
  console.log('match by email        :', byEmail.rows);

  await pool.end();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
