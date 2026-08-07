/**
 * One-off: add Alan Flannery (Trainerize userID 29738605) to the portal as
 * my_fit_coach (he carries the "Connor - MyFitCoach" tag), then backfill his
 * short history. He has only been a client ~2-3 weeks, so a 35-day window
 * covers his entire data set with margin.
 *
 * Usage: node backend/db/add-alan-flannery.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const { trainerizePost } = require('../lib/trainerize');

const COACH_ID = 1;
const TID = '29738605';
const NAME = 'Alan Flannery';
const EMAIL = 'alanflannery73@gmail.com';
const PROGRAM = 'my_fit_coach';
const DATA_TYPES = ['body_stats', 'sleep', 'health_data', 'nutrition', 'workouts'];

const startD = new Date(); startD.setDate(startD.getDate() - 35);
const BACKFILL_START = startD.toISOString().split('T')[0];
const BACKFILL_END = new Date().toISOString().split('T')[0];
// Approximate join date - he's been a client "over 2 weeks". Set 30 days back
// so the Overview "joined" anchor sits safely before his first data.
const JOINED_AT = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })();

let requestCount = 0, windowStart = Date.now();
const RATE_LIMIT = 900;
async function rateLimitedPost(endpoint, body) {
  const elapsed = Date.now() - windowStart;
  if (elapsed >= 60000) { requestCount = 0; windowStart = Date.now(); }
  if (requestCount >= RATE_LIMIT) {
    await new Promise(r => setTimeout(r, 60000 - elapsed + 100));
    requestCount = 0; windowStart = Date.now();
  }
  requestCount++;
  return trainerizePost(endpoint, body, { label: 'AddAlan', useCache: false });
}
async function fetchWithRetry(endpoint, body, maxRetries = 3) {
  const delays = [3000, 6000, 12000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await rateLimitedPost(endpoint, body);
    if (result.data !== null) return result.data;
    if (attempt < maxRetries) await new Promise(r => setTimeout(r, delays[attempt]));
  }
  return null;
}
function dateRange(s, e) {
  const dates = []; const d = new Date(s + 'T00:00:00Z'); const end = new Date(e + 'T00:00:00Z');
  while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setUTCDate(d.getUTCDate() + 1); }
  return dates;
}

async function backfillBodyStats(clientId) {
  const last = await fetchWithRetry('/bodystats/get', { userID: Number(TID), date: 'last', unitWeight: 'kg', unitBodystats: 'cm' });
  if (!last || last.code !== 200 || !last.bodyMeasures?.bodyWeight) return 0;
  const dates = dateRange(BACKFILL_START, BACKFILL_END); let inserted = 0;
  for (let i = 0; i < dates.length; i += 10) {
    const batch = dates.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(date => rateLimitedPost('/bodystats/get', { userID: Number(TID), date, unitWeight: 'kg', unitBodystats: 'cm' })));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== 'fulfilled' || !r.value.data) continue;
      const resp = r.value.data;
      if (resp.code !== 200 || !resp.bodyMeasures) continue;
      const bm = resp.bodyMeasures; const d = bm.date || batch[j];
      await pool.query(
        `INSERT INTO client_body_stats
         (coach_id, client_id, date, body_weight, body_fat_percent, lean_body_mass, fat_mass,
          chest, shoulders, right_bicep, left_bicep, right_forearm, left_forearm,
          right_thigh, left_thigh, right_calf, left_calf, waist, hips, neck,
          blood_pressure_systolic, blood_pressure_diastolic, caliper_bf, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())
         ON CONFLICT (coach_id, client_id, date) DO NOTHING`,
        [COACH_ID, clientId, d, bm.bodyWeight, bm.bodyFatPercent, bm.leanBodyMass, bm.fatMass,
         bm.chest, bm.shoulders, bm.rightBicep, bm.leftBicep, bm.rightForearm, bm.leftForearm,
         bm.rightThigh, bm.leftThigh, bm.rightCalf, bm.leftCalf, bm.waist, bm.hips, bm.neck,
         bm.bloodPressureSystolic, bm.bloodPressureDiastolic, bm.caliperBF]
      );
      inserted++;
    }
  }
  return inserted;
}
async function backfillSleep(clientId) {
  const data = await fetchWithRetry('/healthData/getListSleep', { userID: Number(TID), startTime: BACKFILL_START + ' 00:00:00', endTime: BACKFILL_END + ' 23:59:59' });
  if (!data?.sleep) return 0;
  let inserted = 0;
  for (const seg of data.sleep) {
    if (seg.type !== 'asleep') continue;
    const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
    const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
    const dur = Math.round((end - start) / 1000);
    if (dur <= 0) continue;
    await pool.query(
      `INSERT INTO client_sleep (coach_id, client_id, date, start_time, end_time, duration_seconds, sleep_type, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (coach_id, client_id, date, start_time) DO NOTHING`,
      [COACH_ID, clientId, start.toISOString().split('T')[0], start.toISOString(), end.toISOString(), dur, 'asleep']
    );
    inserted++;
  }
  return inserted;
}
async function backfillHealthData(clientId) {
  const [steps, rhr] = await Promise.all([
    fetchWithRetry('/healthData/getList', { userID: Number(TID), type: 'step', startDate: BACKFILL_START, endDate: BACKFILL_END }),
    fetchWithRetry('/healthData/getList', { userID: Number(TID), type: 'restingHeartRate', startDate: BACKFILL_START, endDate: BACKFILL_END }),
  ]);
  let inserted = 0;
  for (const dataset of [steps, rhr]) {
    if (!dataset?.healthData) continue;
    for (const entry of dataset.healthData) {
      if (!entry.date) continue;
      const value = entry.type === 'step' ? entry.data?.steps : entry.data?.restingHeartRate;
      if (value == null) continue;
      await pool.query(
        `INSERT INTO client_health_data (coach_id, client_id, date, type, value, fetched_at)
         VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (coach_id, client_id, date, type) DO NOTHING`,
        [COACH_ID, clientId, entry.date, entry.type, value]
      );
      inserted++;
    }
  }
  return inserted;
}
async function backfillNutrition(clientId) {
  const data = await fetchWithRetry('/dailyNutrition/getList', { userID: Number(TID), startDate: BACKFILL_START, endDate: BACKFILL_END });
  if (!data?.nutrition) return 0;
  let inserted = 0;
  for (const day of data.nutrition) {
    if (!day.date) continue;
    await pool.query(
      `INSERT INTO client_nutrition (coach_id, client_id, date, calories, protein, fat, carbs, fibre, calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) ON CONFLICT (coach_id, client_id, date) DO NOTHING`,
      [COACH_ID, clientId, day.date, day.calories || 0, day.proteinGrams || 0, day.fatGrams || 0, day.carbsGrams || 0, day.fiberGrams || 0,
       day.goal?.caloricGoal || null, day.goal?.proteinGrams || null, day.goal?.fatGrams || null, day.goal?.carbsGrams || null]
    );
    inserted++;
  }
  return inserted;
}
async function backfillWorkouts(clientId) {
  const chunks = [];
  let cursor = new Date(BACKFILL_START); const end = new Date(BACKFILL_END);
  while (cursor < end) {
    const ce = new Date(cursor); ce.setMonth(ce.getMonth() + 1); if (ce > end) ce.setTime(end.getTime());
    chunks.push({ start: cursor.toISOString().slice(0, 10), end: ce.toISOString().slice(0, 10) });
    cursor = new Date(ce); cursor.setDate(cursor.getDate() + 1);
  }
  const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];
  const workoutIds = [], cardioIds = []; let inserted = 0;
  for (const chunk of chunks) {
    const cal = await fetchWithRetry('/calendar/getList', { userID: Number(TID), startDate: chunk.start, endDate: chunk.end, unitWeight: 'kg' });
    if (!cal?.calendar) continue;
    for (const day of cal.calendar) {
      for (const item of (day.items || [])) {
        if (!(item.status === 'tracked' || item.status === 'checkedIn')) continue;
        if (WORKOUT_TYPES.includes(item.type)) {
          await pool.query(
            `INSERT INTO client_workouts (coach_id, client_id, date, name, status, type, trainerize_id, fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.type, item.id]
          );
          workoutIds.push(item.id); inserted++;
        } else if (item.type === 'cardio') {
          await pool.query(
            `INSERT INTO client_cardio (coach_id, client_id, date, name, status, trainerize_id, fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.id]
          );
          cardioIds.push(item.id); inserted++;
        }
      }
    }
  }
  const allIds = [...workoutIds, ...cardioIds];
  for (let i = 0; i < allIds.length; i += 20) {
    const batch = allIds.slice(i, i + 20);
    const detail = await fetchWithRetry('/dailyWorkout/get', { ids: batch });
    if (!detail?.dailyWorkouts) continue;
    for (const w of detail.dailyWorkouts) {
      const dur = w.duration || w.workDuration || null;
      if (w.type === 'cardio') {
        let distance = null;
        const maxHR = w.trackingStats?.stats?.maxHeartRate || null;
        const cals = w.trackingStats?.stats?.calories || null;
        for (const ex of (w.exercises || [])) for (const s of (ex.stats || [])) if (s.distance != null && (distance == null || s.distance > distance)) distance = s.distance;
        await pool.query(`UPDATE client_cardio SET duration_seconds=$1, distance=$2, calories=$3, max_heart_rate=$4 WHERE coach_id=$5 AND client_id=$6 AND trainerize_id=$7`,
          [dur, distance, cals, maxHR, COACH_ID, clientId, w.id]);
      } else {
        await pool.query(`UPDATE client_workouts SET duration_seconds=$1, detail_json=$2 WHERE coach_id=$3 AND client_id=$4 AND trainerize_id=$5`,
          [dur, JSON.stringify(w), COACH_ID, clientId, w.id]);
      }
    }
  }
  return inserted;
}

(async () => {
  console.log('=== Add Alan Flannery ===');
  console.log(`Backfill range: ${BACKFILL_START} -> ${BACKFILL_END} | joined_at=${JOINED_AT}\n`);

  const existing = await pool.query('SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2', [TID, COACH_ID]);
  let clientId;
  if (existing.rows.length > 0) {
    clientId = existing.rows[0].id;
    await pool.query(`UPDATE clients SET active=true, program=$1, pending_setup=false WHERE id=$2`, [PROGRAM, clientId]);
    console.log(`Already existed (id=${clientId}) - updated to active/${PROGRAM}.`);
  } else {
    const ins = await pool.query(
      `INSERT INTO clients (coach_id, trainerize_id, name, email, program, active, pending_setup, trainerize_joined_at)
       VALUES ($1,$2,$3,$4,$5,true,false,$6) RETURNING id`,
      [COACH_ID, TID, NAME, EMAIL, PROGRAM, JOINED_AT]
    );
    clientId = ins.rows[0].id;
    console.log(`Inserted ${NAME} as portal client id=${clientId} (program=${PROGRAM}).`);
  }
  await pool.query('DELETE FROM backfill_progress WHERE client_id = $1', [clientId]);

  console.log('\nBackfilling...\n');
  const handlers = { body_stats: backfillBodyStats, sleep: backfillSleep, health_data: backfillHealthData, nutrition: backfillNutrition, workouts: backfillWorkouts };
  for (const dt of DATA_TYPES) {
    process.stdout.write(`  ${dt}... `);
    try { const rows = await handlers[dt](clientId); console.log(`${rows} rows`); }
    catch (e) { console.log(`FAILED: ${e.message}`); }
  }
  console.log('\n=== Done. Alan Flannery is live on the dashboard. ===');
  await pool.end();
})().catch(e => { console.error('Fatal:', e); pool.end(); process.exit(1); });
