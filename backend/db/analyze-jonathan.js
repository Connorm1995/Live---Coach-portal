/* Deep-dive analysis of Jonathan Stanley (client 27) for a case-study post.
   Read-only. Reports only real logged numbers. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const cid = 27;

const d = x => (x ? new Date(x).toISOString().split('T')[0] : '-');
const epley = (w, r) => w * (1 + r / 30);

(async () => {
  // ---- Body weight ----
  const bw = (await pool.query(
    `SELECT date, body_weight FROM client_body_stats WHERE client_id=$1 AND body_weight IS NOT NULL ORDER BY date`, [cid]
  )).rows;
  const first = bw[0], last = bw[bw.length - 1];
  const lowest = bw.reduce((m, r) => Number(r.body_weight) < Number(m.body_weight) ? r : m, bw[0]);
  const highest = bw.reduce((m, r) => Number(r.body_weight) > Number(m.body_weight) ? r : m, bw[0]);
  console.log('===== BODY WEIGHT =====');
  console.log(`Logs: ${bw.length} | ${d(first.date)} start ${first.body_weight}kg -> ${d(last.date)} latest ${last.body_weight}kg`);
  console.log(`Highest: ${highest.body_weight}kg (${d(highest.date)}) | Lowest: ${lowest.body_weight}kg (${d(lowest.date)})`);
  console.log(`Start -> lowest: ${(first.body_weight - lowest.body_weight).toFixed(1)}kg`);

  // ---- Waist ----
  const waist = (await pool.query(
    `SELECT date, waist FROM client_body_stats WHERE client_id=$1 AND waist IS NOT NULL ORDER BY date`, [cid]
  )).rows;
  if (waist.length) {
    console.log('\n===== WAIST =====');
    waist.forEach(r => console.log(`  ${d(r.date)}: ${r.waist}cm`));
  }

  // ---- Strength progression ----
  const ws = (await pool.query(
    `SELECT date, detail_json FROM client_workouts WHERE client_id=$1 AND detail_json IS NOT NULL ORDER BY date`, [cid]
  )).rows;

  const byEx = {}; // name -> [{date, weight, reps, e1rm}]
  let totalVolume = 0;
  for (const row of ws) {
    for (const ex of (row.detail_json.exercises || [])) {
      const name = ex.def?.name; if (!name) continue;
      for (const s of (ex.stats || [])) {
        if (s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0) {
          totalVolume += s.weight * s.reps;
          (byEx[name] ||= []).push({ date: row.date, weight: s.weight, reps: s.reps, e1rm: epley(s.weight, s.reps) });
        }
      }
    }
  }

  // For each exercise: first working top-set vs best top-set (by weight, and by e1RM)
  const rows = [];
  for (const [name, sets] of Object.entries(byEx)) {
    const sessions = [...new Set(sets.map(s => d(s.date)))].length;
    if (sessions < 4) continue; // need a real progression history
    const byWeight = [...sets].sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    const byE1rm = [...sets].sort((a, b) => b.e1rm - a.e1rm)[0];
    // earliest session's best set
    const firstDate = d(sets[0].date);
    const firstSets = sets.filter(s => d(s.date) === firstDate);
    const firstBest = firstSets.sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    rows.push({ name, sessions, firstDate,
      first: `${firstBest.weight}kg x ${firstBest.reps}`,
      bestWeight: `${byWeight.weight}kg x ${byWeight.reps} (${d(byWeight.date)})`,
      e1rmGain: (byE1rm.e1rm - epley(firstBest.weight, firstBest.reps)),
      firstE1rm: epley(firstBest.weight, firstBest.reps), bestE1rm: byE1rm.e1rm,
    });
  }
  rows.sort((a, b) => b.e1rmGain - a.e1rmGain);
  console.log('\n===== STRENGTH PROGRESSION (>=4 sessions, sorted by est 1RM gain) =====');
  console.log(`Total volume lifted (all logged sets): ${Math.round(totalVolume).toLocaleString()} kg`);
  for (const r of rows) {
    console.log(`\n${r.name}  [${r.sessions} sessions]`);
    console.log(`  first (${r.firstDate}): ${r.first}  ->  best: ${r.bestWeight}`);
    console.log(`  est 1RM: ${r.firstE1rm.toFixed(1)}kg -> ${r.bestE1rm.toFixed(1)}kg  (+${r.e1rmGain.toFixed(1)}kg, +${((r.bestE1rm/r.firstE1rm-1)*100).toFixed(0)}%)`);
  }

  // ---- Consistency ----
  const strengthCount = ws.length;
  const cardio = (await pool.query(`SELECT count(*) n, count(DISTINCT date) days FROM client_cardio WHERE client_id=$1`, [cid])).rows[0];
  const months = (await pool.query(
    `SELECT to_char(date,'YYYY-MM') m, count(*) n FROM client_workouts WHERE client_id=$1 GROUP BY 1 ORDER BY 1`, [cid])).rows;
  console.log('\n===== CONSISTENCY =====');
  console.log(`Strength sessions: ${strengthCount} | Cardio sessions: ${cardio.n} (${cardio.days} days)`);
  console.log(`Total tracked sessions: ${Number(strengthCount) + Number(cardio.n)}`);
  console.log('Strength sessions/month:', months.map(m => `${m.m}:${m.n}`).join(' '));

  // ---- Nutrition ----
  const nut = (await pool.query(
    `SELECT count(*) days, round(avg(protein)) prot, round(avg(calories)) cals,
            min(date) mn, max(date) mx FROM client_nutrition WHERE client_id=$1 AND calories > 0`, [cid])).rows[0];
  console.log('\n===== NUTRITION =====');
  console.log(`Days tracked (cals>0): ${nut.days} | avg ${nut.cals} kcal, ${nut.prot}g protein | ${d(nut.mn)}->${d(nut.mx)}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
