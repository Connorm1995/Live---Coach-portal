/**
 * One-off script: find Eamonn Kelly in Trainerize, add him to the portal as
 * my_fit_coach, and backfill the last 2 years of data.
 *
 * Usage: node backend/db/add-eamonn-kelly.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const { trainerizePost } = require('../lib/trainerize');

const COACH_ID = 1;
const COACH_TRAINERIZE_ID = 5343380;
const PAGE_SIZE = 100;
const DATA_TYPES = ['body_stats', 'sleep', 'health_data', 'nutrition', 'workouts'];

const TWO_YEARS_AGO = new Date();
TWO_YEARS_AGO.setFullYear(TWO_YEARS_AGO.getFullYear() - 2);
const BACKFILL_START = TWO_YEARS_AGO.toISOString().split('T')[0];
const BACKFILL_END   = new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// Rate limiter (stay under Trainerize 1000 req/min)
// ---------------------------------------------------------------------------
let requestCount = 0;
let windowStart = Date.now();
const RATE_LIMIT = 900;

async function rateLimitedPost(endpoint, body) {
  const elapsed = Date.now() - windowStart;
  if (elapsed >= 60000) { requestCount = 0; windowStart = Date.now(); }

  if (requestCount >= RATE_LIMIT) {
    const waitMs = 60000 - elapsed + 100;
    console.log(`[Rate Limit] Pausing ${Math.round(waitMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, waitMs));
    requestCount = 0;
    windowStart = Date.now();
  }
  requestCount++;
  return trainerizePost(endpoint, body, { label: 'AddEamonnKelly', useCache: false });
}

async function fetchWithRetry(endpoint, body, maxRetries = 3) {
  const delays = [3000, 6000, 12000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await rateLimitedPost(endpoint, body);
    if (result.data !== null) return result.data;
    if (attempt < maxRetries) {
      console.log(`  retry ${attempt + 1}/${maxRetries} in ${delays[attempt] / 1000}s...`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Find Eamonn Kelly in the active client list
// ---------------------------------------------------------------------------
async function findEamonnKelly() {
  let start = 0;
  while (true) {
    const data = await rateLimitedPost('/user/getClientList', {
      userID: COACH_TRAINERIZE_ID,
      view: 'activeClient',
      start,
      count: PAGE_SIZE,
    });
    const users = data.data?.users || [];
    for (const u of users) {
      const full = `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim().toLowerCase();
      if (full === 'eamonn kelly') return u;
    }
    if (users.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backfill helpers (same logic as backfill-trainerize.js)
// ---------------------------------------------------------------------------
function dateRange(startStr, endStr) {
  const dates = [];
  const d = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

async function backfillBodyStats(clientId, tid) {
  const lastEntry = await fetchWithRetry('/bodystats/get', {
    userID: Number(tid), date: 'last', unitWeight: 'kg', unitBodystats: 'cm',
  });
  if (!lastEntry || lastEntry.code !== 200 || !lastEntry.bodyMeasures?.bodyWeight) return 0;

  const dates = dateRange(BACKFILL_START, BACKFILL_END);
  let inserted = 0;

  for (let i = 0; i < dates.length; i += 10) {
    const batch = dates.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(date => rateLimitedPost('/bodystats/get', {
        userID: Number(tid), date, unitWeight: 'kg', unitBodystats: 'cm',
      }))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== 'fulfilled' || !r.value.data) continue;
      const resp = r.value.data;
      if (resp.code !== 200 || !resp.bodyMeasures) continue;
      const bm = resp.bodyMeasures;
      const d = bm.date || batch[j];

      await pool.query(
        `INSERT INTO client_body_stats
         (coach_id, client_id, date, body_weight, body_fat_percent, lean_body_mass, fat_mass,
          chest, shoulders, right_bicep, left_bicep, right_forearm, left_forearm,
          right_thigh, left_thigh, right_calf, left_calf, waist, hips, neck,
          blood_pressure_systolic, blood_pressure_diastolic, caliper_bf, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())
         ON CONFLICT (coach_id, client_id, date) DO NOTHING`,
        [COACH_ID, clientId, d,
         bm.bodyWeight, bm.bodyFatPercent, bm.leanBodyMass, bm.fatMass,
         bm.chest, bm.shoulders, bm.rightBicep, bm.leftBicep,
         bm.rightForearm, bm.leftForearm, bm.rightThigh, bm.leftThigh,
         bm.rightCalf, bm.leftCalf, bm.waist, bm.hips, bm.neck,
         bm.bloodPressureSystolic, bm.bloodPressureDiastolic, bm.caliperBF]
      );
      inserted++;
    }
  }
  return inserted;
}

async function backfillSleep(clientId, tid) {
  const data = await fetchWithRetry('/healthData/getListSleep', {
    userID: Number(tid),
    startTime: BACKFILL_START + ' 00:00:00',
    endTime:   BACKFILL_END   + ' 23:59:59',
  });
  if (!data?.sleep) return 0;

  let inserted = 0;
  for (const seg of data.sleep) {
    if (seg.type !== 'asleep') continue;
    const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
    const end   = new Date(seg.endTime.replace(' ', 'T') + 'Z');
    const durationSec = Math.round((end - start) / 1000);
    if (durationSec <= 0) continue;
    const segDate = start.toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO client_sleep (coach_id, client_id, date, start_time, end_time, duration_seconds, sleep_type, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (coach_id, client_id, date, start_time) DO NOTHING`,
      [COACH_ID, clientId, segDate, start.toISOString(), end.toISOString(), durationSec, 'asleep']
    );
    inserted++;
  }
  return inserted;
}

async function backfillHealthData(clientId, tid) {
  const [stepsData, rhrData] = await Promise.all([
    fetchWithRetry('/healthData/getList', {
      userID: Number(tid), type: 'step', startDate: BACKFILL_START, endDate: BACKFILL_END,
    }),
    fetchWithRetry('/healthData/getList', {
      userID: Number(tid), type: 'restingHeartRate', startDate: BACKFILL_START, endDate: BACKFILL_END,
    }),
  ]);

  let inserted = 0;
  for (const dataset of [stepsData, rhrData]) {
    if (!dataset?.healthData) continue;
    for (const entry of dataset.healthData) {
      if (!entry.date) continue;
      const value = entry.type === 'step' ? entry.data?.steps : entry.data?.restingHeartRate;
      if (value == null) continue;
      await pool.query(
        `INSERT INTO client_health_data (coach_id, client_id, date, type, value, fetched_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (coach_id, client_id, date, type) DO NOTHING`,
        [COACH_ID, clientId, entry.date, entry.type, value]
      );
      inserted++;
    }
  }
  return inserted;
}

async function backfillNutrition(clientId, tid) {
  const data = await fetchWithRetry('/dailyNutrition/getList', {
    userID: Number(tid), startDate: BACKFILL_START, endDate: BACKFILL_END,
  });
  if (!data?.nutrition) return 0;

  let inserted = 0;
  for (const day of data.nutrition) {
    if (!day.date) continue;
    await pool.query(
      `INSERT INTO client_nutrition
       (coach_id, client_id, date, calories, protein, fat, carbs, fibre,
        calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (coach_id, client_id, date) DO NOTHING`,
      [COACH_ID, clientId, day.date,
       day.calories || 0, day.proteinGrams || 0, day.fatGrams || 0,
       day.carbsGrams || 0, day.fiberGrams || 0,
       day.goal?.caloricGoal || null, day.goal?.proteinGrams || null,
       day.goal?.fatGrams || null, day.goal?.carbsGrams || null]
    );
    inserted++;
  }
  return inserted;
}

async function backfillWorkouts(clientId, tid) {
  const chunks = [];
  let cursor = new Date(BACKFILL_START);
  const end = new Date(BACKFILL_END);
  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end:   chunkEnd.toISOString().slice(0, 10),
    });
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];
  const workoutIds = [];
  const cardioIds = [];
  let inserted = 0;

  for (const chunk of chunks) {
    const calendarData = await fetchWithRetry('/calendar/getList', {
      userID: Number(tid), startDate: chunk.start, endDate: chunk.end, unitWeight: 'kg',
    });
    if (!calendarData?.calendar) continue;

    for (const day of calendarData.calendar) {
      for (const item of (day.items || [])) {
        const completed = item.status === 'tracked' || item.status === 'checkedIn';
        if (!completed) continue;

        if (WORKOUT_TYPES.includes(item.type)) {
          await pool.query(
            `INSERT INTO client_workouts (coach_id, client_id, date, name, status, type, trainerize_id, fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.type, item.id]
          );
          workoutIds.push(item.id);
          inserted++;
        } else if (item.type === 'cardio') {
          await pool.query(
            `INSERT INTO client_cardio (coach_id, client_id, date, name, status, trainerize_id, fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.id]
          );
          cardioIds.push(item.id);
          inserted++;
        }
      }
    }
  }

  // Fetch workout/cardio details
  const allDetailIds = [...workoutIds, ...cardioIds];
  for (let i = 0; i < allDetailIds.length; i += 20) {
    const batch = allDetailIds.slice(i, i + 20);
    const detailData = await fetchWithRetry('/dailyWorkout/get', { ids: batch });
    if (!detailData?.dailyWorkouts) continue;

    for (const w of detailData.dailyWorkouts) {
      const durationSec = w.duration || w.workDuration || null;
      if (w.type === 'cardio') {
        let distance = null;
        const maxHR = w.trackingStats?.stats?.maxHeartRate || null;
        const calories = w.trackingStats?.stats?.calories || null;
        for (const ex of (w.exercises || []))
          for (const s of (ex.stats || []))
            if (s.distance != null && (distance == null || s.distance > distance)) distance = s.distance;
        await pool.query(
          `UPDATE client_cardio SET duration_seconds=$1, distance=$2, calories=$3, max_heart_rate=$4
           WHERE coach_id=$5 AND client_id=$6 AND trainerize_id=$7`,
          [durationSec, distance, calories, maxHR, COACH_ID, clientId, w.id]
        );
      } else {
        await pool.query(
          `UPDATE client_workouts SET duration_seconds=$1, detail_json=$2
           WHERE coach_id=$3 AND client_id=$4 AND trainerize_id=$5`,
          [durationSec, JSON.stringify(w), COACH_ID, clientId, w.id]
        );
      }
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Add Eamonn Kelly ===\n');
  console.log(`Backfill range: ${BACKFILL_START} → ${BACKFILL_END}\n`);

  // 1. Find Eamonn Kelly in Trainerize
  console.log('Searching Trainerize active clients for Eamonn Kelly...');
  const eamonnUser = await findEamonnKelly();
  if (!eamonnUser) {
    console.error('ERROR: Could not find "Eamonn Kelly" in the active client list. Make sure he is active in Trainerize.');
    process.exit(1);
  }
  const tid = String(eamonnUser.id);
  const email = (eamonnUser.email || '').toLowerCase() || null;
  console.log(`Found: ${eamonnUser.firstName} ${eamonnUser.lastName} | trainerize_id=${tid} | email=${email || '(none)'}\n`);

  // 2. Upsert into clients table
  const existing = await pool.query(
    `SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
    [tid, COACH_ID]
  );

  let clientId;
  if (existing.rows.length > 0) {
    clientId = existing.rows[0].id;
    // Row already created by reconciliation - just confirm program and finish setup.
    // Keep trainerize_joined_at as-is (he actually joined July 2026).
    await pool.query(
      `UPDATE clients SET active=true, program='my_fit_coach', pending_setup=false
       WHERE id=$1`,
      [clientId]
    );
    console.log(`Client already exists (id=${clientId}) - confirmed program=my_fit_coach, cleared pending_setup.\n`);
  } else {
    const ins = await pool.query(
      `INSERT INTO clients (coach_id, trainerize_id, name, email, program, active, pending_setup, trainerize_joined_at)
       VALUES ($1, $2, $3, $4, 'my_fit_coach', true, false, $5)
       RETURNING id`,
      [COACH_ID, tid, `${eamonnUser.firstName} ${eamonnUser.lastName}`.trim(), email, BACKFILL_START]
    );
    clientId = ins.rows[0].id;
    console.log(`Inserted Eamonn Kelly as portal client id=${clientId}.\n`);
  }

  // 3. Clear any stale backfill_progress so the backfill runs fresh
  await pool.query(
    `DELETE FROM backfill_progress WHERE client_id = $1`,
    [clientId]
  );

  // 4. Run backfill
  console.log(`Starting 2-year backfill for client id=${clientId}...\n`);

  const handlers = {
    body_stats:  () => backfillBodyStats(clientId, tid),
    sleep:       () => backfillSleep(clientId, tid),
    health_data: () => backfillHealthData(clientId, tid),
    nutrition:   () => backfillNutrition(clientId, tid),
    workouts:    () => backfillWorkouts(clientId, tid),
  };

  for (const dt of DATA_TYPES) {
    process.stdout.write(`  ${dt}... `);
    try {
      const rows = await handlers[dt]();
      console.log(`${rows} rows inserted`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log('\n=== Done. Eamonn Kelly is live on the dashboard. ===');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end();
  process.exit(1);
});
