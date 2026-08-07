/**
 * Export all of Daniel Condren's body weight + body fat measurements,
 * from his first log to today, into a Google Sheets-ready CSV.
 * Read-only against Trainerize; writes a CSV file.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

const TID = 21459057;            // Daniel Condren
const START = '2025-01-17';      // his trainerize join date (first possible log)
const END = new Date().toISOString().split('T')[0];
const OUT = path.resolve(__dirname, '../../daniel-condren-bodystats.csv');

async function tz(endpoint, body) {
  const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: AUTH },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

function dateRange(s, e) {
  const dates = [];
  const d = new Date(s + 'T00:00:00Z');
  const end = new Date(e + 'T00:00:00Z');
  while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setUTCDate(d.getUTCDate() + 1); }
  return dates;
}

(async () => {
  console.log(`Fetching body stats for Daniel Condren (${TID}) from ${START} to ${END}...`);
  const dates = dateRange(START, END);
  const rows = [];

  for (let i = 0; i < dates.length; i += 10) {
    const batch = dates.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(date => tz('/bodystats/get', { userID: TID, date, unitWeight: 'kg', unitBodystats: 'cm' }))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== 'fulfilled') continue;
      const resp = r.value;
      if (resp.code !== 200 || !resp.bodyMeasures) continue;
      const bm = resp.bodyMeasures;
      const weight = bm.bodyWeight;
      const bf = bm.bodyFatPercent;
      // Only keep days that actually have a weight or body fat reading
      if ((weight == null || weight === 0) && (bf == null || bf === 0)) continue;
      rows.push({ date: bm.date || batch[j], weight, bf });
    }
    process.stdout.write(`\r  ${Math.min(i + 10, dates.length)}/${dates.length} days checked, ${rows.length} logs found`);
  }
  console.log('');

  // Sort chronologically and dedupe by date (keep first)
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set();
  const clean = rows.filter(r => (seen.has(r.date) ? false : seen.add(r.date)));

  // Build CSV - header + rows. Plain numbers and ISO dates parse cleanly in Sheets.
  const header = 'Date,Body Weight (kg),Body Fat (%)';
  const lines = clean.map(r => {
    const w = (r.weight == null || r.weight === 0) ? '' : r.weight;
    const f = (r.bf == null || r.bf === 0) ? '' : r.bf;
    return `${r.date},${w},${f}`;
  });
  const csv = header + '\r\n' + lines.join('\r\n') + '\r\n';

  fs.writeFileSync(OUT, csv, 'utf8');
  console.log(`\nWrote ${clean.length} rows to ${OUT}`);
  if (clean.length) {
    console.log(`Date range in file: ${clean[0].date} -> ${clean[clean.length - 1].date}`);
    console.log('First 3 rows:');
    console.log(header);
    lines.slice(0, 3).forEach(l => console.log(l));
  }
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
