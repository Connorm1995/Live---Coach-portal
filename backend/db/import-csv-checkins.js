/**
 * import-csv-checkins.js
 *
 * Reads a Typeform CSV export and inserts weekly check-in responses
 * into the checkins table, mapping field refs and applying weighted
 * scoring brackets per connor-weekly-checkin-reference.md.
 *
 * Usage:
 *   node backend/db/import-csv-checkins.js <csv-path> [--insert]
 *
 * Without --insert it prints a preview table only (dry run).
 * With --insert it writes to the database inside a transaction.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const pool = require('./pool');

const COACH_ID = 1;

// ---------------------------------------------------------------------------
// Scoring bracket tables  (raw 1-10 -> weighted 1-5)
// ---------------------------------------------------------------------------
const BRACKETS = {
  overall:   [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  training:  [1, 1, 2, 2, 2, 3, 3, 4, 5, 5],
  steps:     [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition: [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep:     [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion: [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress:    [5, 5, 5, 5, 4, 3, 3, 2, 2, 2], // INVERTED
};

const DAYS_ON_PLAN_WEIGHTS = { '0-1 days': 1, '2-3 days': 2, '4-5 days': 4, '6-7 days': 5 };
const PROGRESS_WEIGHTS     = { 'Progressed': 5, 'Stayed the same': 3, 'Regressed': 1 };

function w(category, raw) { return BRACKETS[category][raw - 1]; }

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV parser (handles quoted multi-line fields)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n') { current.push(field); field = ''; rows.push(current); current = []; }
      else if (ch !== '\r') { field += ch; }
    }
  }
  if (field || current.length) { current.push(field); rows.push(current); }
  return rows;
}

// ---------------------------------------------------------------------------
// Column discovery - find indices by header text
// ---------------------------------------------------------------------------
function mapColumns(headers) {
  const col = {};
  headers.forEach((h, i) => {
    const t = h.trim();
    if (t === '#')                                     col.responseId = i;
    if (t.includes('Full name'))                       col.name = i;
    if (t.includes('overall performance'))              col.overall = i;
    if (t.includes('biggest win'))                      col.biggestWin = i;
    if (t.includes('training/cardio'))                  col.training = i;
    if (t.includes('daily step target'))                col.steps = i;
    if (t.includes('rate your nutrition'))              col.nutrition = i;
    if (t.includes('on plan') && t.includes('days'))   col.daysOnPlan = i;
    if (t.includes('rate your sleep'))                  col.sleep = i;
    if (t.includes('rate your digestion'))              col.digestion = i;
    if (t.includes('stress level'))                     col.stress = i;
    if (t.includes('higher stress'))                    col.stressSource = i;
    if (t.includes('progressed') && t.includes('regressed')) col.progress = i;
    if (t.includes('coming up'))                        col.upcomingNotes = i;
    if (t === 'Submit Date (UTC)')                      col.submitDate = i;
    if (t === 'Score')                                  col.score = i;
    if (t.includes('No, all good'))                     col.helpNoAllGood = i;
  });

  // The help-request "Other" free-text column is the last "Other" before upcoming notes
  for (let i = col.upcomingNotes - 1; i >= 0; i--) {
    if (headers[i].trim() === 'Other') { col.helpOther = i; break; }
  }

  // Collect help-topic checkbox column indices (between helpNoAllGood and helpOther)
  col.helpCheckboxes = [];
  if (col.helpNoAllGood != null && col.helpOther != null) {
    for (let i = col.helpNoAllGood + 1; i < col.helpOther; i++) {
      col.helpCheckboxes.push({ idx: i, label: headers[i].trim() });
    }
  }

  return col;
}

// ---------------------------------------------------------------------------
// Cycle start = most recent Sunday on or before the submit date (UTC)
// ---------------------------------------------------------------------------
function getCycleStart(submitDateStr) {
  const d = new Date(submitDateStr.trim() + 'Z');
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Extract a structured week object from one CSV data row
// ---------------------------------------------------------------------------
function extractWeek(row, col) {
  const val = (idx) => (idx != null && row[idx] != null) ? row[idx].trim() : '';
  const num = (idx) => { const v = val(idx); return v ? parseInt(v, 10) : null; };

  // Build help request text
  let helpParts = [];
  const noAllGood = val(col.helpNoAllGood);
  if (noAllGood) helpParts.push(noAllGood);
  for (const cb of col.helpCheckboxes) {
    const v = val(cb.idx);
    if (v) helpParts.push(cb.label);
  }
  const helpOther = val(col.helpOther);
  if (helpOther) helpParts.push(helpOther);
  const helpRequest = helpParts.join('; ') || '';

  return {
    typeformResponseId: val(col.responseId),
    name:              val(col.name),
    submittedAt:       val(col.submitDate).trim() + 'Z',
    cycleStart:        getCycleStart(val(col.submitDate)),
    overall:           num(col.overall),
    training:          num(col.training),
    steps:             num(col.steps),
    nutrition:         num(col.nutrition),
    daysOnPlan:        val(col.daysOnPlan),
    sleep:             num(col.sleep),
    digestion:         num(col.digestion),
    stress:            num(col.stress),
    progress:          val(col.progress),
    biggestWin:        val(col.biggestWin),
    helpRequest:       helpRequest,
    upcomingNotes:     val(col.upcomingNotes),
    stressSource:      val(col.stressSource),
    csvScore:          parseFloat(val(col.score)) || null,
  };
}

// ---------------------------------------------------------------------------
// Compute weighted scores for a week
// ---------------------------------------------------------------------------
function computeScores(wk) {
  const scores = {
    overall:   w('overall',   wk.overall),
    training:  w('training',  wk.training),
    steps:     w('steps',     wk.steps),
    nutrition: w('nutrition',  wk.nutrition),
    daysOnPlan: DAYS_ON_PLAN_WEIGHTS[wk.daysOnPlan] || 0,
    sleep:     w('sleep',     wk.sleep),
    digestion: w('digestion', wk.digestion),
    stress:    w('stress',    wk.stress),
    progress:  PROGRESS_WEIGHTS[wk.progress] || 0,
  };
  scores.total = Object.values(scores).reduce((s, v) => s + v, 0);
  return scores;
}

// ---------------------------------------------------------------------------
// Build form_data JSONB (Typeform answer structure that overview.js parses)
// ---------------------------------------------------------------------------
function buildFormData(wk) {
  const answers = [];

  // Client name
  answers.push({
    type: 'text', text: wk.name,
    field: { id: 'be65ced6-dd03-44dd-86a8-e09d7d48f334', type: 'short_text', title: 'Your full name' },
  });

  // Q1: Overall performance
  answers.push({
    type: 'number', number: wk.overall,
    field: { id: '08a11882-5f58-44a8-9e70-5d108f2aaedc', type: 'opinion_scale',
             title: 'How would you rate your overall performance this week?', properties: { steps: 10 } },
  });

  // Q2: Training/cardio
  answers.push({
    type: 'number', number: wk.training,
    field: { id: '522e6339-ef63-49c7-9b95-4d925841afe2', type: 'opinion_scale',
             title: 'How did your training/cardio go this week?', properties: { steps: 10 } },
  });

  // Q3: Steps
  answers.push({
    type: 'number', number: wk.steps,
    field: { id: '33b74dae-ec78-4b11-a236-ef7639ae5473', type: 'opinion_scale',
             title: 'Did you hit your daily step target this week?', properties: { steps: 10 } },
  });

  // Q4: Nutrition
  answers.push({
    type: 'number', number: wk.nutrition,
    field: { id: '88b092a4-e251-47ce-a298-520ef4edc1cc', type: 'opinion_scale',
             title: 'How would you rate your nutrition this week?', properties: { steps: 10 } },
  });

  // Q5: Days on plan (choice)
  answers.push({
    type: 'choice', choice: { label: wk.daysOnPlan },
    field: { id: '87aa3c32-a515-4a76-a9d6-257a08bbb893', type: 'multiple_choice',
             title: 'Roughly how many days this week would you say you were on plan with food?' },
  });

  // Q6: Sleep
  answers.push({
    type: 'number', number: wk.sleep,
    field: { id: 'b56a1664-564e-4046-a1f0-b4502c5c613e', type: 'opinion_scale',
             title: 'How would you rate your sleep this week on average?', properties: { steps: 10 } },
  });

  // Q7: Digestion
  answers.push({
    type: 'number', number: wk.digestion,
    field: { id: 'b4ec8f22-da73-4b69-9d13-bbde511d7b5e', type: 'opinion_scale',
             title: 'How would you rate your digestion this week on average?', properties: { steps: 10 } },
  });

  // Q8: Stress (INVERTED)
  answers.push({
    type: 'number', number: wk.stress,
    field: { id: '1f75d0a7-b810-4f00-821a-e8151e27d8fe', type: 'opinion_scale',
             title: 'What was your average stress level this week?', properties: { steps: 10 } },
  });

  // Q8 follow-up: stress source
  if (wk.stressSource) {
    answers.push({
      type: 'text', text: wk.stressSource,
      field: { id: '6f1349a2-e67a-42e5-90ca-48752037f4c6', type: 'long_text',
               title: 'What was the main source of stress?' },
    });
  }

  // Q9: Progress direction (choice)
  answers.push({
    type: 'choice', choice: { label: wk.progress },
    field: { id: '1a1768d8-ed8f-4780-aece-f06e9221e7ad', type: 'multiple_choice',
             title: 'Do you feel you progressed, regressed, or stayed the same last week?' },
  });

  // Q10: Biggest win
  answers.push({
    type: 'text', text: wk.biggestWin,
    field: { id: '72dfa035-75f0-4401-be78-84f8cb5da3cf', type: 'long_text',
             title: 'What was your biggest win this week?' },
  });

  // Q11: Help request
  answers.push({
    type: 'text', text: wk.helpRequest,
    field: { id: '0c8bb709-de48-480e-b4da-8232827200ae', type: 'long_text',
             title: 'Where would you like extra help or support from me this week?' },
  });

  // Q12: Upcoming notes
  answers.push({
    type: 'text', text: wk.upcomingNotes,
    field: { id: '147c7a86-c8fd-4782-8f45-0995a5dad8e7', type: 'long_text',
             title: 'Is there anything coming up this week I should know about?' },
  });

  return answers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2];
  const doInsert = process.argv.includes('--insert');

  if (!csvPath) {
    console.error('Usage: node import-csv-checkins.js <csv-path> [--insert]');
    process.exit(1);
  }

  // 1. Parse CSV
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(raw);
  const headers = rows[0];
  const col = mapColumns(headers);

  // Filter to data rows with a response ID
  const dataRows = rows.slice(1).filter(r => r[col.responseId] && r[col.responseId].trim());

  // 2. Extract and score each week
  const weeks = dataRows.map(r => {
    const wk = extractWeek(r, col);
    const sc = computeScores(wk);
    return { ...wk, weighted: sc };
  });

  // Sort oldest first
  weeks.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

  // 3. Print preview
  console.log('\n=== PREVIEW: Brendan Smartt check-in import ===\n');
  console.log(
    'Week'.padEnd(6) +
    'Cycle Start'.padEnd(14) +
    'Submitted'.padEnd(22) +
    'OVR TRN STP NUT DOP SLP DIG STR PRG'.padEnd(38) +
    'Weighted'.padEnd(40) +
    'Total  CSV   Match'
  );
  console.log('-'.repeat(140));

  let allMatch = true;
  weeks.forEach((wk, i) => {
    const sc = wk.weighted;
    const csvScore = wk.csvScore;
    const match = csvScore === sc.total;
    if (!match) allMatch = false;

    console.log(
      `${(i + 1).toString().padEnd(6)}` +
      `${wk.cycleStart.padEnd(14)}` +
      `${wk.submittedAt.slice(0, 19).padEnd(22)}` +
      `${[wk.overall, wk.training, wk.steps, wk.nutrition, wk.daysOnPlan, wk.sleep, wk.digestion, wk.stress, wk.progress].map(v => String(v).padEnd(4)).join('')}` +
      `${[sc.overall, sc.training, sc.steps, sc.nutrition, sc.daysOnPlan, sc.sleep, sc.digestion, sc.stress, sc.progress].map(v => String(v).padEnd(4)).join('')}  ` +
      `${String(sc.total).padEnd(7)}` +
      `${String(csvScore).padEnd(6)}` +
      `${match ? 'OK' : 'MISMATCH'}`
    );
  });

  console.log('\n--- Text fields ---\n');
  weeks.forEach((wk, i) => {
    console.log(`Week ${i + 1} (${wk.cycleStart}):`);
    console.log(`  Biggest win:    ${wk.biggestWin.slice(0, 100)}${wk.biggestWin.length > 100 ? '...' : ''}`);
    console.log(`  Help request:   ${wk.helpRequest.slice(0, 100)}${wk.helpRequest.length > 100 ? '...' : ''}`);
    console.log(`  Upcoming notes: ${wk.upcomingNotes.slice(0, 100)}${wk.upcomingNotes.length > 100 ? '...' : ''}`);
    console.log(`  Stress source:  ${wk.stressSource || '(none)'}`);
    console.log(`  Response ID:    ${wk.typeformResponseId}`);
    console.log('');
  });

  if (!allMatch) {
    console.error('WARNING: Some computed scores do not match CSV scores!');
  } else {
    console.log('All computed scores match the CSV. Ready to insert.\n');
  }

  // 4. Insert if --insert flag
  if (!doInsert) {
    console.log('Dry run complete. Re-run with --insert to write to the database.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    const brendan = await client.query(
      `SELECT id FROM clients WHERE name = 'Brendan Smartt' AND coach_id = $1`,
      [COACH_ID]
    );
    if (brendan.rows.length === 0) throw new Error('Brendan Smartt not found in clients table.');
    const clientId = brendan.rows[0].id;

    await client.query('BEGIN');

    for (const wk of weeks) {
      const formData = buildFormData(wk);
      await client.query(
        `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, responded_at, cycle_start, form_data)
         VALUES ($1, $2, 'weekly', $3, $4, false, NULL, $5, $6)
         ON CONFLICT (typeform_response_id) DO NOTHING`,
        [COACH_ID, clientId, wk.typeformResponseId, wk.submittedAt, wk.cycleStart, JSON.stringify(formData)]
      );
    }

    await client.query('COMMIT');
    console.log(`Inserted ${weeks.length} check-ins for Brendan Smartt.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Insert failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
