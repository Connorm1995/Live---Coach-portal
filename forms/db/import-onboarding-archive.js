/**
 * Import historical Typeform onboarding questionnaires into onboarding_archive.
 *
 * These are a read-only record of forms filled in before MyFitCoach Forms
 * existed. They are deliberately NOT linked to clients and NOT synced to
 * Trainerize - Connor's requirement is simply somewhere to look back at old
 * onboarding forms. See the onboarding_archive comment in db/migrate.js.
 *
 * Each answer is stored with the question exactly as it was asked, in the
 * original order. The two forms asked different questions (30 vs 39), so
 * flattening them into one shape would misrepresent the older ones.
 *
 * Idempotent: keyed on the Typeform response id with ON CONFLICT DO NOTHING,
 * so re-running only adds what is missing. Safe to resume after a failure.
 *
 * Usage:
 *   node forms/db/import-onboarding-archive.js            dry run (default)
 *   node forms/db/import-onboarding-archive.js --commit   write to the database
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const TOKEN = process.env.TYPEFORM_PERSONAL_ACCESS_TOKEN;
const COACH_ID = 1;

const FORMS = [
  { id: 'UPiYhp4b', label: 'Onboarding client questionnaire (original)' },
  { id: 'H4Y0MeYY', label: 'Connor 2026 - MyFitCoach Onboarding Form' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Typeform's API returns intermittent 504s. Retry with backoff rather than
 * abandoning a 322-record import because of one bad response.
 */
async function api(path, { attempts = 25 } = {}) {
  let lastStatus = null;
  let reported = 0;
  for (let a = 1; a <= attempts; a++) {
    let res;
    try {
      res = await fetch('https://api.typeform.com' + path, {
        headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
      });
    } catch (err) {
      lastStatus = err.message;
      await sleep(Math.min(3000 * a, 20000));
      continue;
    }
    if (res.ok) {
      if (reported) process.stdout.write(`(recovered after ${reported}) `);
      return res.json();
    }
    lastStatus = res.status;
    // 4xx other than 429 will not fix themselves.
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Typeform ${path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    reported = a;
    if (a === 1 || a % 5 === 0) process.stdout.write(`(${res.status}, retrying ${a}/${attempts}) `);
    await sleep(Math.min(3000 * a, 20000));
  }
  throw new Error(`Typeform ${path} failed after ${attempts} attempts, last status ${lastStatus}. ` +
    'Their API is having a bad day - the import is idempotent, so just run it again later.');
}

/**
 * Typeform stores emphasis as markdown in the question text, so titles arrive
 * as "*First name*". Strip the markers only - the wording itself is untouched,
 * because the point of this archive is what was actually asked.
 */
function cleanQuestion(title) {
  return String(title || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ref -> { title, type, order } so answers can carry their original wording. */
async function fieldMap(formId) {
  const form = await api(`/forms/${formId}`);
  const map = new Map();
  (form.fields || []).forEach((f, i) => {
    map.set(f.ref, { title: cleanQuestion(f.title), type: f.type, order: i });
  });
  return { title: form.title, map };
}

/** Every response, following Typeform's cursor if there is more than one page. */
async function allResponses(formId) {
  const out = [];
  let before = null;
  for (;;) {
    const q = `/forms/${formId}/responses?page_size=1000${before ? '&before=' + before : ''}`;
    const page = await api(q);
    const items = page.items || [];
    out.push(...items);
    if (items.length === 0 || out.length >= page.total_items) break;
    before = items[items.length - 1].token;
    if (!before) break;
  }
  return out;
}

/** Flatten one Typeform answer to a readable string. */
function answerText(a) {
  if (a == null) return '';
  if (a.text != null) return String(a.text);
  if (a.email != null) return String(a.email);
  if (a.phone_number != null) return String(a.phone_number);
  if (a.number != null) return String(a.number);
  if (a.boolean != null) return a.boolean ? 'Yes' : 'No';
  if (a.date != null) return String(a.date).slice(0, 10);
  if (a.url != null) return String(a.url);
  if (a.file_url != null) return String(a.file_url);
  if (a.choice) return String(a.choice.label || a.choice.other || '');
  if (a.choices) {
    const labels = (a.choices.labels || []).slice();
    if (a.choices.other) labels.push(a.choices.other);
    return labels.join(', ');
  }
  if (a.payment) return String(a.payment.amount || '');
  return '';
}

function buildRecord(item, form, fields) {
  const answers = (item.answers || [])
    .map((a) => {
      const meta = fields.map.get(a.field.ref) || {};
      return {
        ref: a.field.ref,
        question: meta.title || '(question no longer in the form)',
        type: a.field.type,
        answer: answerText(a),
        order: meta.order == null ? 999 : meta.order,
      };
    })
    .sort((x, y) => x.order - y.order)
    .map(({ order, ...rest }) => rest); // order was only for sorting

  // Name and email are pulled out so the archive is searchable. Matched on the
  // question wording rather than hardcoded refs, since the two forms differ.
  const find = (re) => {
    const hit = answers.find((x) => re.test(x.question));
    return hit ? hit.answer.trim() : '';
  };
  const first = find(/first name/i);
  const surname = find(/surname|last name/i);
  const emailAnswer = (item.answers || []).find((a) => a.field.type === 'email');

  return {
    source: form.id,
    sourceFormTitle: fields.title || form.label,
    sourceResponseId: item.response_id || item.token,
    name: [first, surname].filter(Boolean).join(' ').trim() || null,
    email: (emailAnswer ? String(emailAnswer.email) : '').trim().toLowerCase() || null,
    submittedAt: item.submitted_at || item.landed_at || null,
    answers,
  };
}

async function main() {
  const commit = process.argv.includes('--commit');
  if (!TOKEN) throw new Error('TYPEFORM_PERSONAL_ACCESS_TOKEN is not set in .env');

  console.log(`${commit ? 'IMPORTING' : 'DRY RUN'} - historical onboarding questionnaires`);
  console.log('  destination: onboarding_archive (no client link, no Trainerize)\n');

  const records = [];
  for (const form of FORMS) {
    process.stdout.write(`  ${form.id}: reading form structure... `);
    const fields = await fieldMap(form.id);
    process.stdout.write(`${fields.map.size} questions. fetching responses... `);
    const items = await allResponses(form.id);
    console.log(`${items.length} responses`);
    for (const item of items) records.push(buildRecord(item, form, fields));
  }

  const withName = records.filter((r) => r.name).length;
  const withEmail = records.filter((r) => r.email).length;
  const dates = records.map((r) => r.submittedAt).filter(Boolean).sort();
  const answerCounts = records.map((r) => r.answers.length);

  console.log(`\n  total records     : ${records.length}`);
  console.log(`  with a name       : ${withName}`);
  console.log(`  with an email     : ${withEmail}`);
  console.log(`  date range        : ${String(dates[0]).slice(0, 10)} to ${String(dates[dates.length - 1]).slice(0, 10)}`);
  console.log(`  answers per record: ${Math.min(...answerCounts)} to ${Math.max(...answerCounts)}`);

  const ids = new Set(records.map((r) => r.sourceResponseId));
  console.log(`  unique response ids: ${ids.size}${ids.size === records.length ? '' : '  <- DUPLICATES'}`);

  const sample = records.find((r) => r.name) || records[0];
  if (sample) {
    console.log(`\n  Sample - ${sample.name} <${sample.email}>, ${String(sample.submittedAt).slice(0, 10)}`);
    sample.answers.slice(0, 3).forEach((a) => {
      console.log(`    Q: ${a.question.slice(0, 68)}`);
      console.log(`    A: ${a.answer.slice(0, 68)}`);
    });
    console.log(`    ... and ${sample.answers.length - 3} more`);
  }

  if (!commit) {
    console.log('\nDry run only. Nothing written. Re-run with --commit to import.');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const r of records) {
    const res = await pool.query(
      `INSERT INTO onboarding_archive
         (coach_id, source, source_form_title, source_response_id, name, email, submitted_at, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (coach_id, source_response_id) DO NOTHING
       RETURNING id`,
      [COACH_ID, r.source, r.sourceFormTitle, r.sourceResponseId, r.name, r.email,
        r.submittedAt, JSON.stringify(r.answers)]
    );
    if (res.rowCount === 1) inserted++; else skipped++;
  }

  const total = await pool.query(
    `SELECT count(*)::int AS n FROM onboarding_archive WHERE coach_id = $1`, [COACH_ID]);
  console.log(`\nDone. ${inserted} imported, ${skipped} already present.`);
  console.log(`Archive now holds ${total.rows[0].n} onboarding forms.`);
}

main()
  .then(() => pool.end())
  .catch((err) => { console.error('\nFAILED:', err.message); pool.end(); process.exit(1); });
