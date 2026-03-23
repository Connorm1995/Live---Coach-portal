/**
 * backfill-trainerize.js
 *
 * Fetches 12 months of historical Trainerize data for all active clients
 * and stores it in PostgreSQL. Resumes from where it left off if interrupted.
 *
 * Usage:
 *   node backend/db/backfill-trainerize.js           # full backfill
 *   node backend/db/backfill-trainerize.js --dry-run  # show plan only
 *
 * Rate limit: Trainerize allows 1000 req/min. We track and throttle at 900.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');
const { trainerizePost } = require('../lib/trainerize');

const COACH_ID = 1;
const DRY_RUN = process.argv.includes('--dry-run');
const PARALLEL_CLIENTS = 5;
const RATE_LIMIT = 900; // stay under 1000/min
const DATA_TYPES = ['body_stats', 'sleep', 'health_data', 'nutrition', 'workouts'];

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------
let requestCount = 0;
let windowStart = Date.now();

async function rateLimitedPost(endpoint, body) {
  // Check rate limit
  const elapsed = Date.now() - windowStart;
  if (elapsed >= 60000) {
    requestCount = 0;
    windowStart = Date.now();
  }

  if (requestCount >= RATE_LIMIT) {
    const waitMs = 60000 - elapsed + 100;
    console.log(`[Rate Limit] Pausing ${Math.round(waitMs / 1000)}s (${requestCount} requests this minute)`);
    await new Promise(r => setTimeout(r, waitMs));
    requestCount = 0;
    windowStart = Date.now();
  }

  requestCount++;
  // 30-second timeout so we never hang on a Trainerize call
  const timeoutMs = 30000;
  const result = await Promise.race([
    trainerizePost(endpoint, body, { label: 'Backfill', useCache: false }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Backfill call timed out after 30s')), timeoutMs))
  ]);
  return result;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------
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
// Date helpers
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

// Per-client range: from their Trainerize join date to today
function getClientRange(joinedAt) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(joinedAt).toISOString().split('T')[0];
  return { start, end };
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------
async function getProgress(clientId, dataType) {
  const r = await pool.query(
    `SELECT status FROM backfill_progress WHERE client_id = $1 AND data_type = $2`,
    [clientId, dataType]
  );
  return r.rows[0]?.status || null;
}

async function setProgress(clientId, dataType, status, rowsInserted = 0, errorMsg = null) {
  await pool.query(
    `INSERT INTO backfill_progress (client_id, data_type, status, started_at, completed_at, rows_inserted, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (client_id, data_type) DO UPDATE SET
       status = $3,
       started_at = CASE WHEN $3 = 'in_progress' THEN now() ELSE backfill_progress.started_at END,
       completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN now() ELSE NULL END,
       rows_inserted = $6,
       error_message = $7`,
    [clientId, dataType, status,
     status === 'in_progress' ? new Date() : null,
     ['completed', 'failed'].includes(status) ? new Date() : null,
     rowsInserted, errorMsg]
  );
}

// ---------------------------------------------------------------------------
// Backfill functions per data type
// ---------------------------------------------------------------------------

async function backfillBodyStats(clientId, tid, range) {
  // First check if there's any data via "last" entry
  const lastEntry = await fetchWithRetry('/bodystats/get', {
    userID: Number(tid), date: 'last', unitWeight: 'kg', unitBodystats: 'cm',
  });
  if (!lastEntry || lastEntry.code !== 200 || !lastEntry.bodyMeasures?.bodyWeight) {
    return 0;
  }

  const dates = dateRange(range.start, range.end);
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

async function backfillSleep(clientId, tid, range) {
  const data = await fetchWithRetry('/healthData/getListSleep', {
    userID: Number(tid),
    startTime: range.start + ' 00:00:00',
    endTime: range.end + ' 23:59:59',
  });
  if (!data?.sleep) return 0;

  let inserted = 0;
  for (const seg of data.sleep) {
    if (seg.type !== 'asleep') continue;
    const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
    const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
    const durationSec = Math.round((end - start) / 1000);
    if (durationSec <= 0) continue;
    const segDate = start.toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO client_sleep (coach_id, client_id, date, start_time, end_time, duration_seconds, sleep_type, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (coach_id, client_id, date, start_time) DO NOTHING`,
      [COACH_ID, clientId, segDate, start.toISOString(), end.toISOString(), durationSec, 'asleep']
    );
    inserted++;
  }
  return inserted;
}

async function backfillHealthData(clientId, tid, range) {
  const [stepsData, rhrData] = await Promise.all([
    fetchWithRetry('/healthData/getList', {
      userID: Number(tid), type: 'step', startDate: range.start, endDate: range.end,
    }),
    fetchWithRetry('/healthData/getList', {
      userID: Number(tid), type: 'restingHeartRate', startDate: range.start, endDate: range.end,
    }),
  ]);

  let inserted = 0;

  for (const dataset of [stepsData, rhrData]) {
    if (!dataset?.healthData) continue;
    for (const entry of dataset.healthData) {
      if (!entry.date) continue;
      const value = entry.type === 'step' ? entry.data?.steps
        : entry.data?.restingHeartRate;
      if (value == null) continue;

      await pool.query(
        `INSERT INTO client_health_data (coach_id, client_id, date, type, value, fetched_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (coach_id, client_id, date, type) DO NOTHING`,
        [COACH_ID, clientId, entry.date, entry.type, value]
      );
      inserted++;
    }
  }
  return inserted;
}

async function backfillNutrition(clientId, tid, range) {
  const data = await fetchWithRetry('/dailyNutrition/getList', {
    userID: Number(tid), startDate: range.start, endDate: range.end,
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

async function backfillWorkouts(clientId, tid, range) {
  // Chunk into 1-month windows - Trainerize truncates large date ranges
  const chunks = [];
  let cursor = new Date(range.start);
  const end = new Date(range.end);
  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: chunkEnd.toISOString().slice(0, 10),
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.type, item.id]
          );
          workoutIds.push(item.id);
          inserted++;
        } else if (item.type === 'cardio') {
          await pool.query(
            `INSERT INTO client_cardio (coach_id, client_id, date, name, status, trainerize_id, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO NOTHING`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.id]
          );
          cardioIds.push(item.id);
          inserted++;
        }
      }
    }
  }

  // Fetch workout details in batches
  const allDetailIds = [...workoutIds, ...cardioIds];
  for (let i = 0; i < allDetailIds.length; i += 20) {
    const batch = allDetailIds.slice(i, i + 20);
    const detailData = await fetchWithRetry('/dailyWorkout/get', { ids: batch });
    if (!detailData?.dailyWorkouts) continue;

    for (const w of detailData.dailyWorkouts) {
      const durationSec = w.duration || w.workDuration || null;
      const isCardio = w.type === 'cardio';

      if (isCardio) {
        let distance = null;
        let maxHR = w.trackingStats?.stats?.maxHeartRate || null;
        let calories = w.trackingStats?.stats?.calories || null;
        for (const ex of (w.exercises || [])) {
          for (const s of (ex.stats || [])) {
            if (s.distance != null && (distance == null || s.distance > distance)) distance = s.distance;
          }
        }
        await pool.query(
          `UPDATE client_cardio SET duration_seconds = $1, distance = $2, calories = $3, max_heart_rate = $4
           WHERE coach_id = $5 AND client_id = $6 AND trainerize_id = $7`,
          [durationSec, distance, calories, maxHR, COACH_ID, clientId, w.id]
        );
      } else {
        await pool.query(
          `UPDATE client_workouts SET duration_seconds = $1, detail_json = $2
           WHERE coach_id = $3 AND client_id = $4 AND trainerize_id = $5`,
          [durationSec, JSON.stringify(w), COACH_ID, clientId, w.id]
        );
      }
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Main backfill
// ---------------------------------------------------------------------------

async function backfill() {
  // Get all active clients with Trainerize IDs and their join dates
  const clientsResult = await pool.query(
    `SELECT id, name, trainerize_id, trainerize_joined_at, created_at FROM clients
     WHERE coach_id = $1 AND active = true AND trainerize_id IS NOT NULL
     ORDER BY name`,
    [COACH_ID]
  );
  const clients = clientsResult.rows;

  // Calculate per-client ranges from their actual Trainerize join date
  const today = new Date().toISOString().split('T')[0];
  const clientRanges = {};
  for (const c of clients) {
    const joinDate = c.trainerize_joined_at || c.created_at;
    clientRanges[c.id] = getClientRange(joinDate);
  }

  // Find earliest and latest for display
  const earliest = clients.reduce((min, c) => {
    const r = clientRanges[c.id];
    return r.start < min ? r.start : min;
  }, today);

  console.log(`\n[Backfill] ${clients.length} clients, ${DATA_TYPES.length} data types each`);
  console.log(`[Backfill] Per-client ranges from each client's Trainerize join date to ${today}`);
  console.log(`[Backfill] Earliest client joined: ${earliest}`);
  console.log(`[Backfill] Parallel clients: ${PARALLEL_CLIENTS}`);

  const estMinutes = Math.ceil((clients.length / PARALLEL_CLIENTS) * 20 / 60);
  console.log(`[Backfill] Estimated time: ${estMinutes}-${estMinutes * 2} minutes\n`);

  if (DRY_RUN) {
    console.log('[Backfill] DRY RUN - showing plan only, no data will be fetched\n');
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const range = clientRanges[c.id];
      const months = Math.round((new Date(range.end) - new Date(range.start)) / (30.44 * 24 * 60 * 60 * 1000));
      const statuses = [];
      for (const dt of DATA_TYPES) {
        const status = await getProgress(c.id, dt);
        statuses.push(`${dt}: ${status || 'pending'}`);
      }
      console.log(`  ${i + 1}/${clients.length}: ${c.name} (${months}mo from ${range.start}) - ${statuses.join(', ')}`);
    }
    console.log('\n[Backfill] DRY RUN complete. Run without --dry-run to start backfill.');
    await pool.end();
    return;
  }

  // Process clients in parallel batches
  for (let i = 0; i < clients.length; i += PARALLEL_CLIENTS) {
    const batch = clients.slice(i, i + PARALLEL_CLIENTS);
    await Promise.all(batch.map((client, batchIdx) =>
      processClient(client, i + batchIdx + 1, clients.length, clientRanges[client.id])
    ));
  }

  console.log('\n[Backfill] COMPLETE');
  await pool.end();
}

async function processClient(client, num, total, range) {
  const { id, name, trainerize_id: tid } = client;
  const months = Math.round((new Date(range.end) - new Date(range.start)) / (30.44 * 24 * 60 * 60 * 1000));
  const prefix = `[Backfill] Client ${num}/${total}: ${name} (${months}mo)`;
  console.log(`${prefix} starting from ${range.start}...`);

  const handlers = {
    body_stats: () => backfillBodyStats(id, tid, range),
    sleep: () => backfillSleep(id, tid, range),
    health_data: () => backfillHealthData(id, tid, range),
    nutrition: () => backfillNutrition(id, tid, range),
    workouts: () => backfillWorkouts(id, tid, range),
  };

  let totalRows = 0;
  const start = Date.now();

  // Run all data types in parallel for this client
  const results = await Promise.allSettled(
    DATA_TYPES.map(async (dt) => {
      const status = await getProgress(id, dt);
      if (status === 'completed' || status === 'done') {
        process.stdout.write(`  ${dt}: skipped (already done) `);
        return 0;
      }
      // Reset any stuck 'in_progress' from killed runs - just retry them
      await setProgress(id, dt, 'in_progress');
      try {
        const rows = await handlers[dt]();
        await setProgress(id, dt, 'completed', rows);
        process.stdout.write(`  ${dt}: ${rows} rows \u2713 `);
        return rows;
      } catch (err) {
        await setProgress(id, dt, 'failed', 0, err.message);
        process.stdout.write(`  ${dt}: FAILED (${err.message}) `);
        return 0;
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') totalRows += r.value;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${prefix} DONE (${totalRows} rows, ${elapsed}s)`);
}

backfill().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  pool.end();
  process.exit(1);
});
