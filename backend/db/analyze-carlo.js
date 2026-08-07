/* Deep-dive analysis of Carlo Salizzo (client 9) for a case-study post.
   Read-only. Reports only real logged numbers. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const cid = 9;
const d = x => (x ? new Date(x).toISOString().split('T')[0] : '-');
const epley = (w, r) => w * (1 + r / 30);

(async () => {
  // ---- Body weight ----
  const bw = (await pool.query(`SELECT date, body_weight FROM client_body_stats WHERE client_id=$1 AND body_weight IS NOT NULL ORDER BY date`, [cid])).rows;
  const bwFirst = bw[0], bwLast = bw[bw.length-1];
  const bwLow = bw.reduce((m,r)=>+r.body_weight<+m.body_weight?r:m, bw[0]);
  const bwHigh = bw.reduce((m,r)=>+r.body_weight>+m.body_weight?r:m, bw[0]);
  console.log('===== BODY WEIGHT =====');
  console.log(`Logs ${bw.length} | start ${bwFirst.body_weight}kg (${d(bwFirst.date)}) -> latest ${bwLast.body_weight}kg (${d(bwLast.date)})`);
  console.log(`High ${bwHigh.body_weight}kg (${d(bwHigh.date)}) | Low ${bwLow.body_weight}kg (${d(bwLow.date)}) | start->low ${(bwFirst.body_weight-bwLow.body_weight).toFixed(1)}kg`);
  const wm = (await pool.query(`SELECT to_char(date,'YYYY-MM') m, round(avg(body_weight)::numeric,1) a FROM client_body_stats WHERE client_id=$1 AND body_weight IS NOT NULL GROUP BY 1 ORDER BY 1`, [cid])).rows;
  console.log('Monthly avg:', wm.map(r=>`${r.m}:${r.a}`).join(' '));

  // ---- Body fat % ----
  const bf = (await pool.query(`SELECT date, body_fat_percent FROM client_body_stats WHERE client_id=$1 AND body_fat_percent IS NOT NULL AND body_fat_percent>0 ORDER BY date`, [cid])).rows;
  if (bf.length) {
    const f0=bf[0], fl=bf[bf.length-1];
    const flow=bf.reduce((m,r)=>+r.body_fat_percent<+m.body_fat_percent?r:m, bf[0]);
    const fhigh=bf.reduce((m,r)=>+r.body_fat_percent>+m.body_fat_percent?r:m, bf[0]);
    console.log('\n===== BODY FAT % =====');
    console.log(`Logs ${bf.length} | start ${f0.body_fat_percent}% (${d(f0.date)}) -> latest ${fl.body_fat_percent}% (${d(fl.date)})`);
    console.log(`High ${fhigh.body_fat_percent}% (${d(fhigh.date)}) | Low ${flow.body_fat_percent}% (${d(flow.date)})`);
    const fm = (await pool.query(`SELECT to_char(date,'YYYY-MM') m, round(avg(body_fat_percent)::numeric,1) a FROM client_body_stats WHERE client_id=$1 AND body_fat_percent>0 GROUP BY 1 ORDER BY 1`, [cid])).rows;
    console.log('Monthly avg:', fm.map(r=>`${r.m}:${r.a}`).join(' '));
  }

  // ---- Strength ----
  const ws = (await pool.query(`SELECT date, detail_json FROM client_workouts WHERE client_id=$1 AND detail_json IS NOT NULL ORDER BY date`, [cid])).rows;
  const byEx = {}; let vol=0;
  for (const row of ws) for (const ex of (row.detail_json.exercises||[])) {
    const n=ex.def?.name; if(!n) continue;
    for (const s of (ex.stats||[])) if (s.weight>0 && s.reps>0){ vol+=s.weight*s.reps; (byEx[n]||=[]).push({date:row.date,weight:s.weight,reps:s.reps,e:epley(s.weight,s.reps)}); }
  }
  const rows=[];
  for (const [n,sets] of Object.entries(byEx)) {
    const sess=[...new Set(sets.map(s=>d(s.date)))].length; if(sess<4) continue;
    const fd=d(sets[0].date); const fb=sets.filter(s=>d(s.date)===fd).sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0];
    const bestW=[...sets].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0];
    const bestE=[...sets].sort((a,b)=>b.e-a.e)[0];
    rows.push({n,sess,fd,first:`${fb.weight}x${fb.reps}`,best:`${bestW.weight}x${bestW.reps} (${d(bestW.date)})`,fe:epley(fb.weight,fb.reps),be:bestE.e});
  }
  rows.sort((a,b)=>(b.be-b.fe)-(a.be-a.fe));
  console.log('\n===== STRENGTH (>=4 sessions, by est 1RM gain) =====');
  console.log(`Total volume: ${Math.round(vol).toLocaleString()} kg`);
  for (const r of rows.slice(0,18)) console.log(`${r.n} [${r.sess}s]  first(${r.fd}) ${r.first} -> best ${r.best}  | 1RM ${r.fe.toFixed(0)}->${r.be.toFixed(0)}kg (+${((r.be/r.fe-1)*100).toFixed(0)}%)`);

  // ---- Consistency ----
  const cardio=(await pool.query(`SELECT count(*) n, count(DISTINCT date) days FROM client_cardio WHERE client_id=$1`,[cid])).rows[0];
  const sm=(await pool.query(`SELECT to_char(date,'YYYY-MM') m, count(*) n FROM client_workouts WHERE client_id=$1 GROUP BY 1 ORDER BY 1`,[cid])).rows;
  console.log('\n===== CONSISTENCY =====');
  console.log(`Strength ${ws.length} | Cardio ${cardio.n} (${cardio.days} days) | Total ${Number(ws.length)+Number(cardio.n)}`);
  console.log('Strength/mo:', sm.map(r=>`${r.m}:${r.n}`).join(' '));

  // ---- Nutrition ----
  const nut=(await pool.query(`SELECT count(*) days, round(avg(protein)) p, round(avg(calories)) c FROM client_nutrition WHERE client_id=$1 AND calories>0`,[cid])).rows[0];
  console.log('\n===== NUTRITION =====');
  console.log(`Days tracked ${nut.days} | avg ${nut.c} kcal, ${nut.p}g protein`);

  // ---- Steps ----
  const sc=(await pool.query(`SELECT to_char(date,'YYYY-MM') m, round(avg(value)) a, count(*) n FROM client_health_data WHERE client_id=$1 AND type='step' GROUP BY 1 ORDER BY 1`,[cid])).rows;
  if (sc.length){ console.log('\n===== STEPS (monthly avg) ====='); console.log(sc.map(r=>`${r.m}:${r.a}`).join(' ')); }

  // ---- Resting HR ----
  const rhr=(await pool.query(`SELECT to_char(date,'YYYY-MM') m, round(avg(value)) a FROM client_health_data WHERE client_id=$1 AND type='restingHeartRate' GROUP BY 1 ORDER BY 1`,[cid])).rows;
  if (rhr.length){ console.log('\n===== RESTING HR (monthly avg bpm) ====='); console.log(rhr.map(r=>`${r.m}:${r.a}`).join(' ')); }

  // ---- Sleep (avg hours/night) ----
  const sl=(await pool.query(`SELECT round((avg(nightly)/3600.0)::numeric,2) avg_h, count(*) nights FROM (SELECT date, sum(duration_seconds) nightly FROM client_sleep WHERE client_id=$1 GROUP BY date) t`,[cid])).rows[0];
  if (sl && sl.nights>0) console.log(`\n===== SLEEP =====\nAvg ${sl.avg_h}h/night over ${sl.nights} nights`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
