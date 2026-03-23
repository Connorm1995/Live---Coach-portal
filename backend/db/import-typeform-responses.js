/**
 * import-typeform-responses.js
 *
 * Fetches ALL historical responses from the Typeform API for both
 * the weekly check-in (n3gubYfj) and EOM report (iISVFuRv) forms,
 * fuzzy-matches them to clients, and inserts into the checkins table.
 *
 * Deduplicates on typeform_response_id (ON CONFLICT DO NOTHING),
 * so it's safe to run multiple times.
 *
 * Usage: node backend/db/import-typeform-responses.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const TYPEFORM_TOKEN = process.env.TYPEFORM_PERSONAL_ACCESS_TOKEN;
const COACH_ID = 1;
const MATCH_THRESHOLD = 0.8;

const FORMS = [
  { formId: 'n3gubYfj', type: 'weekly' },
  { formId: 'iISVFuRv', type: 'eom_report' },
];

// --- Fuzzy matching (same as webhook) ---

function normalise(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const normA = normalise(a);
  const normB = normalise(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(normA, normB) / maxLen;
}

function findBestMatch(submittedName, clients) {
  let bestMatch = null;
  let bestScore = 0;
  for (const client of clients) {
    const score = similarity(submittedName, client.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = client;
    }
  }
  return { match: bestMatch, score: bestScore };
}

// --- Cycle start calculation for historical dates ---

function getCycleSunday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Sun
  const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return sunday.toISOString().split('T')[0];
}

function getMonthFirst(dateStr) {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// --- Typeform API ---

async function fetchAllResponses(formId) {
  const allResponses = [];
  let before = null;
  let page = 1;

  while (true) {
    let url = `https://api.typeform.com/forms/${formId}/responses?page_size=1000`;
    if (before) url += `&before=${before}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TYPEFORM_TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Typeform API] Error fetching form ${formId} page ${page}: ${res.status} ${text}`);
      break;
    }

    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) break;

    allResponses.push(...items);
    console.log(`  Page ${page}: ${items.length} responses (${allResponses.length} total so far)`);

    // Cursor pagination: use the token of the last item as 'before'
    before = items[items.length - 1].token;
    page++;

    // Safety: if we got fewer than page_size, we've reached the end
    if (items.length < 1000) break;
  }

  return allResponses;
}

// --- Main import ---

async function importAll() {
  // Load all clients for fuzzy matching
  const clientsResult = await pool.query(
    `SELECT id, name FROM clients WHERE coach_id = $1`,
    [COACH_ID]
  );
  const clients = clientsResult.rows;
  console.log(`Loaded ${clients.length} clients for matching\n`);

  let totalInserted = 0;
  let totalSkippedDup = 0;
  let totalUnmatched = 0;
  const unmatchedNames = [];

  for (const form of FORMS) {
    console.log(`\n--- Fetching ${form.type} responses (form: ${form.formId}) ---`);
    const responses = await fetchAllResponses(form.formId);
    console.log(`Total responses for ${form.type}: ${responses.length}\n`);

    let formInserted = 0;
    let formSkipped = 0;
    let formUnmatched = 0;

    for (const resp of responses) {
      const responseId = resp.token;
      const submittedAt = resp.submitted_at || resp.landed_at || new Date().toISOString();
      const answers = resp.answers || [];

      // Extract client name
      const nameAnswer = answers.find(
        (a) => a.type === 'text' && a.field && a.field.type === 'short_text'
      ) || answers.find((a) => a.type === 'text');

      const clientName = nameAnswer ? (nameAnswer.text || '').trim() : null;

      if (!clientName) {
        console.log(`  SKIP (no name): response ${responseId}`);
        formUnmatched++;
        continue;
      }

      // Fuzzy match
      const { match, score } = findBestMatch(clientName, clients);

      if (!match || score < MATCH_THRESHOLD) {
        console.log(`  UNMATCHED: "${clientName}" - best: "${match ? match.name : 'none'}" (${(score * 100).toFixed(1)}%)`);
        formUnmatched++;
        unmatchedNames.push({ name: clientName, bestMatch: match?.name, score, responseId });
        continue;
      }

      // Calculate cycle_start based on submission date
      const cycleStart = form.type === 'weekly'
        ? getCycleSunday(submittedAt)
        : getMonthFirst(submittedAt);

      const formDataJson = answers.length > 0 ? JSON.stringify(answers) : null;

      // Insert with dedup
      const result = await pool.query(
        `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, cycle_start, form_data)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7)
         ON CONFLICT (typeform_response_id) DO NOTHING
         RETURNING id`,
        [COACH_ID, match.id, form.type, responseId, submittedAt, cycleStart, formDataJson]
      );

      if (result.rows.length > 0) {
        console.log(`  INSERTED: "${clientName}" -> "${match.name}" (${(score * 100).toFixed(1)}%) id=${result.rows[0].id} cycle=${cycleStart}`);
        formInserted++;
      } else {
        formSkipped++;
      }
    }

    console.log(`\n${form.type} summary: ${formInserted} inserted, ${formSkipped} duplicates skipped, ${formUnmatched} unmatched`);
    totalInserted += formInserted;
    totalSkippedDup += formSkipped;
    totalUnmatched += formUnmatched;
  }

  console.log(`\n========================================`);
  console.log(`TOTAL: ${totalInserted} inserted, ${totalSkippedDup} duplicates skipped, ${totalUnmatched} unmatched`);

  if (unmatchedNames.length > 0) {
    console.log(`\nUnmatched submissions (review these):`);
    unmatchedNames.forEach(u => {
      console.log(`  "${u.name}" - best: "${u.bestMatch}" (${(u.score * 100).toFixed(1)}%) - response: ${u.responseId}`);
    });
  }

  // Final count
  const finalCount = await pool.query('SELECT COUNT(*) FROM checkins');
  console.log(`\nTotal check-ins in database: ${finalCount.rows[0].count}`);

  await pool.end();
}

importAll().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
