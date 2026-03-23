/**
 * trainerize-store.js
 *
 * DB-backed Trainerize data layer. Checks PostgreSQL first, only calls the
 * Trainerize API when data is missing or stale (current-week data older than
 * 5 minutes). Historical data (before current Monday) is never re-fetched.
 */

const pool = require('../db/pool');
const { trainerizePost } = require('./trainerize');

const COACH_ID = 1;
const FRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes for current-week data

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonday() {
  const now = new Date();
  const dublin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Dublin' }));
  const dow = dublin.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dublin);
  monday.setDate(monday.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function isHistoricalDate(dateStr) {
  return dateStr < getCurrentMonday();
}

function isFresh(fetchedAt) {
  if (!fetchedAt) return false;
  return (Date.now() - new Date(fetchedAt).getTime()) < FRESH_TTL_MS;
}

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

// ---------------------------------------------------------------------------
// Body Stats
// ---------------------------------------------------------------------------

async function getBodyStats(clientId, tid, startDate, endDate) {
  if (!tid) return [];

  const allDates = dateRange(startDate, endDate);
  const currentMonday = getCurrentMonday();

  // Query what we already have
  const existing = await pool.query(
    `SELECT date::text AS date, body_weight, fetched_at FROM client_body_stats
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4
     ORDER BY date`,
    [clientId, COACH_ID, startDate, endDate]
  );

  const dbMap = {};
  for (const row of existing.rows) {
    dbMap[row.date] = row;
  }

  // Determine which dates need fetching
  const toFetch = [];
  for (const date of allDates) {
    const row = dbMap[date];
    if (row) {
      if (isHistoricalDate(date)) continue; // historical, already stored
      if (isFresh(row.fetched_at)) continue; // current week but still fresh
    }
    toFetch.push(date);
  }

  // Fetch missing dates from Trainerize in batches of 10
  if (toFetch.length > 0) {
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(date =>
          trainerizePost('/bodystats/get', {
            userID: Number(tid), date, unitWeight: 'kg', unitBodystats: 'cm',
          }, { label: 'Store' })
        )
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status !== 'fulfilled') continue;
        const resp = r.value.data;
        if (!resp || resp.code !== 200 || !resp.bodyMeasures) continue;
        const bm = resp.bodyMeasures;
        const d = bm.date || batch[j];

        await pool.query(
          `INSERT INTO client_body_stats
           (coach_id, client_id, date, body_weight, body_fat_percent, lean_body_mass, fat_mass,
            chest, shoulders, right_bicep, left_bicep, right_forearm, left_forearm,
            right_thigh, left_thigh, right_calf, left_calf, waist, hips, neck,
            blood_pressure_systolic, blood_pressure_diastolic, caliper_bf, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())
           ON CONFLICT (coach_id, client_id, date) DO UPDATE SET
             body_weight = EXCLUDED.body_weight,
             body_fat_percent = EXCLUDED.body_fat_percent,
             lean_body_mass = EXCLUDED.lean_body_mass,
             fat_mass = EXCLUDED.fat_mass,
             chest = EXCLUDED.chest, shoulders = EXCLUDED.shoulders,
             right_bicep = EXCLUDED.right_bicep, left_bicep = EXCLUDED.left_bicep,
             right_forearm = EXCLUDED.right_forearm, left_forearm = EXCLUDED.left_forearm,
             right_thigh = EXCLUDED.right_thigh, left_thigh = EXCLUDED.left_thigh,
             right_calf = EXCLUDED.right_calf, left_calf = EXCLUDED.left_calf,
             waist = EXCLUDED.waist, hips = EXCLUDED.hips, neck = EXCLUDED.neck,
             blood_pressure_systolic = EXCLUDED.blood_pressure_systolic,
             blood_pressure_diastolic = EXCLUDED.blood_pressure_diastolic,
             caliper_bf = EXCLUDED.caliper_bf,
             fetched_at = now()`,
          [COACH_ID, clientId, d,
           bm.bodyWeight, bm.bodyFatPercent, bm.leanBodyMass, bm.fatMass,
           bm.chest, bm.shoulders, bm.rightBicep, bm.leftBicep,
           bm.rightForearm, bm.leftForearm, bm.rightThigh, bm.leftThigh,
           bm.rightCalf, bm.leftCalf, bm.waist, bm.hips, bm.neck,
           bm.bloodPressureSystolic, bm.bloodPressureDiastolic, bm.caliperBF]
        );

        dbMap[d] = { date: d, body_weight: bm.bodyWeight };
      }
    }
  }

  // Return weight entries from DB (what the routes actually use)
  const finalResult = await pool.query(
    `SELECT date::text AS date, body_weight AS weight FROM client_body_stats
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4
       AND body_weight IS NOT NULL
     ORDER BY date`,
    [clientId, COACH_ID, startDate, endDate]
  );

  return finalResult.rows.map(r => ({ date: r.date, weight: Number(r.weight) }));
}

// ---------------------------------------------------------------------------
// Sleep Data
// ---------------------------------------------------------------------------

async function getSleepData(clientId, tid, startDate, endDate) {
  if (!tid) return null;

  const currentMonday = getCurrentMonday();

  // Check if we have fresh data for this range
  const existing = await pool.query(
    `SELECT MIN(fetched_at) AS oldest_fetch FROM client_sleep
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4`,
    [clientId, COACH_ID, startDate, endDate]
  );

  const oldestFetch = existing.rows[0]?.oldest_fetch;
  const rangeIsHistorical = endDate < currentMonday;
  const hasCachedData = oldestFetch != null;

  if (hasCachedData && (rangeIsHistorical || isFresh(oldestFetch))) {
    // Return from DB
    const rows = await pool.query(
      `SELECT date::text AS date, start_time, end_time, duration_seconds, sleep_type
       FROM client_sleep
       WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4
       ORDER BY date, start_time`,
      [clientId, COACH_ID, startDate, endDate]
    );
    return buildSleepResponse(rows.rows);
  }

  // Fetch from Trainerize
  const result = await trainerizePost('/healthData/getListSleep', {
    userID: Number(tid),
    startTime: startDate + ' 00:00:00',
    endTime: endDate + ' 23:59:59',
  }, { label: 'Store' });

  const raw = result.data;

  // Store segments in DB
  if (raw?.sleep && Array.isArray(raw.sleep)) {
    for (const seg of raw.sleep) {
      if (seg.type !== 'asleep') continue;
      const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
      const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
      const durationSec = Math.round((end - start) / 1000);
      if (durationSec <= 0) continue;

      const segDate = start.toISOString().split('T')[0];

      await pool.query(
        `INSERT INTO client_sleep (coach_id, client_id, date, start_time, end_time, duration_seconds, sleep_type, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (coach_id, client_id, date, start_time) DO UPDATE SET
           end_time = EXCLUDED.end_time, duration_seconds = EXCLUDED.duration_seconds, fetched_at = now()`,
        [COACH_ID, clientId, segDate, start.toISOString(), end.toISOString(), durationSec, 'asleep']
      );
    }
  }

  // Return the raw Trainerize response (routes already know how to parse it)
  return raw;
}

function buildSleepResponse(rows) {
  // Reconstruct the Trainerize-like response from DB rows
  const sleep = rows.map(r => ({
    type: r.sleep_type || 'asleep',
    startTime: new Date(r.start_time).toISOString().replace('T', ' ').replace('Z', ''),
    endTime: new Date(r.end_time).toISOString().replace('T', ' ').replace('Z', ''),
  }));
  return { sleep };
}

// ---------------------------------------------------------------------------
// Health Data (steps, resting heart rate)
// ---------------------------------------------------------------------------

async function getHealthData(clientId, tid, type, startDate, endDate) {
  if (!tid) return null;

  const currentMonday = getCurrentMonday();

  // Check DB
  const existing = await pool.query(
    `SELECT date::text AS date, value, fetched_at FROM client_health_data
     WHERE client_id = $1 AND coach_id = $2 AND type = $3 AND date >= $4 AND date <= $5
     ORDER BY date`,
    [clientId, COACH_ID, type, startDate, endDate]
  );

  const allDates = dateRange(startDate, endDate);
  const rangeIsHistorical = endDate < currentMonday;

  // If we have data for all dates and it's historical or fresh, use DB
  if (existing.rows.length >= allDates.length && (rangeIsHistorical || isFresh(existing.rows[0]?.fetched_at))) {
    return buildHealthResponse(existing.rows, type);
  }

  // Fetch from Trainerize
  const result = await trainerizePost('/healthData/getList', {
    userID: Number(tid), type, startDate, endDate,
  }, { label: 'Store' });

  const raw = result.data;

  // Store in DB
  if (raw?.healthData && Array.isArray(raw.healthData)) {
    for (const entry of raw.healthData) {
      if (!entry.date) continue;
      const value = type === 'step' ? entry.data?.steps
        : type === 'restingHeartRate' ? entry.data?.restingHeartRate
        : entry.data?.calorieOut;
      if (value == null) continue;

      await pool.query(
        `INSERT INTO client_health_data (coach_id, client_id, date, type, value, fetched_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (coach_id, client_id, date, type) DO UPDATE SET
           value = EXCLUDED.value, fetched_at = now()`,
        [COACH_ID, clientId, entry.date, type, value]
      );
    }
  }

  // Return raw response (routes parse it themselves)
  return raw;
}

function buildHealthResponse(rows, type) {
  const dataKey = type === 'step' ? 'steps' : type;
  return {
    healthData: rows.map(r => ({
      date: r.date,
      type,
      data: { [dataKey]: Number(r.value) },
    })),
  };
}

// ---------------------------------------------------------------------------
// Nutrition Data (list)
// ---------------------------------------------------------------------------

async function getNutritionData(clientId, tid, startDate, endDate) {
  if (!tid) return null;

  const currentMonday = getCurrentMonday();

  // Check DB
  const existing = await pool.query(
    `SELECT date::text AS date, calories, protein, fat, carbs, fibre, saturated_fat,
            calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at
     FROM client_nutrition
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4
     ORDER BY date`,
    [clientId, COACH_ID, startDate, endDate]
  );

  const allDates = dateRange(startDate, endDate);
  const rangeIsHistorical = endDate < currentMonday;

  if (existing.rows.length >= allDates.length && (rangeIsHistorical || isFresh(existing.rows[0]?.fetched_at))) {
    return buildNutritionListResponse(existing.rows);
  }

  // Fetch from Trainerize
  const result = await trainerizePost('/dailyNutrition/getList', {
    userID: Number(tid), startDate, endDate,
  }, { label: 'Store' });

  const raw = result.data;

  // Store in DB
  if (raw?.nutrition && Array.isArray(raw.nutrition)) {
    for (const day of raw.nutrition) {
      if (!day.date) continue;
      await pool.query(
        `INSERT INTO client_nutrition
         (coach_id, client_id, date, calories, protein, fat, carbs, fibre,
          calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         ON CONFLICT (coach_id, client_id, date) DO UPDATE SET
           calories = EXCLUDED.calories, protein = EXCLUDED.protein,
           fat = EXCLUDED.fat, carbs = EXCLUDED.carbs, fibre = EXCLUDED.fibre,
           calories_goal = EXCLUDED.calories_goal, protein_goal = EXCLUDED.protein_goal,
           fat_goal = EXCLUDED.fat_goal, carbs_goal = EXCLUDED.carbs_goal,
           fetched_at = now()`,
        [COACH_ID, clientId, day.date,
         day.calories || 0, day.proteinGrams || 0, day.fatGrams || 0,
         day.carbsGrams || 0, day.fiberGrams || 0,
         day.goal?.caloricGoal || null, day.goal?.proteinGrams || null,
         day.goal?.fatGrams || null, day.goal?.carbsGrams || null]
      );
    }
  }

  return raw;
}

function buildNutritionListResponse(rows) {
  return {
    nutrition: rows.map(r => ({
      date: r.date,
      calories: Number(r.calories) || 0,
      proteinGrams: Number(r.protein) || 0,
      fatGrams: Number(r.fat) || 0,
      carbsGrams: Number(r.carbs) || 0,
      fiberGrams: Number(r.fibre) || 0,
      goal: r.calories_goal ? {
        caloricGoal: Number(r.calories_goal),
        proteinGrams: Number(r.protein_goal),
        fatGrams: Number(r.fat_goal),
        carbsGrams: Number(r.carbs_goal),
      } : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Nutrition Detail (per-day, includes saturated fat via nutrients array)
// ---------------------------------------------------------------------------

async function getNutritionDetail(clientId, tid, date) {
  if (!tid) return null;

  const currentMonday = getCurrentMonday();

  // Check DB - if we have saturated_fat populated, we have detail data
  const existing = await pool.query(
    `SELECT date::text AS date, calories, protein, fat, carbs, fibre, saturated_fat,
            calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at
     FROM client_nutrition
     WHERE client_id = $1 AND coach_id = $2 AND date = $3`,
    [clientId, COACH_ID, date]
  );

  const row = existing.rows[0];
  if (row && row.saturated_fat != null && (isHistoricalDate(date) || isFresh(row.fetched_at))) {
    return buildNutritionDetailResponse(row);
  }

  // Fetch from Trainerize (per-day endpoint gives nutrients array with sat fat)
  const result = await trainerizePost('/dailyNutrition/get', {
    userID: Number(tid), date,
  }, { label: 'Store' });

  const raw = result.data;

  // Store/update with saturated fat
  if (raw?.nutrition) {
    const n = raw.nutrition;
    const satFat = extractNutrient(n.nutrients, 606);

    await pool.query(
      `INSERT INTO client_nutrition
       (coach_id, client_id, date, calories, protein, fat, carbs, fibre, saturated_fat,
        calories_goal, protein_goal, fat_goal, carbs_goal, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (coach_id, client_id, date) DO UPDATE SET
         calories = EXCLUDED.calories, protein = EXCLUDED.protein,
         fat = EXCLUDED.fat, carbs = EXCLUDED.carbs, fibre = EXCLUDED.fibre,
         saturated_fat = EXCLUDED.saturated_fat,
         calories_goal = EXCLUDED.calories_goal, protein_goal = EXCLUDED.protein_goal,
         fat_goal = EXCLUDED.fat_goal, carbs_goal = EXCLUDED.carbs_goal,
         fetched_at = now()`,
      [COACH_ID, clientId, date,
       n.calories || 0, n.proteinGrams || 0, n.fatGrams || 0,
       n.carbsGrams || 0, n.fiberGrams || 0, satFat,
       n.goal?.caloricGoal || null, n.goal?.proteinGrams || null,
       n.goal?.fatGrams || null, n.goal?.carbsGrams || null]
    );
  }

  return raw;
}

function extractNutrient(nutrients, nutrNo) {
  if (!Array.isArray(nutrients)) return 0;
  const entry = nutrients.find(n => n.nutrNo === nutrNo);
  return entry ? entry.nutrVal : 0;
}

function buildNutritionDetailResponse(row) {
  return {
    nutrition: {
      date: row.date,
      calories: Number(row.calories) || 0,
      proteinGrams: Number(row.protein) || 0,
      fatGrams: Number(row.fat) || 0,
      carbsGrams: Number(row.carbs) || 0,
      fiberGrams: Number(row.fibre) || 0,
      nutrients: [{ nutrNo: 606, nutrVal: Number(row.saturated_fat) || 0 }],
      goal: row.calories_goal ? {
        caloricGoal: Number(row.calories_goal),
        proteinGrams: Number(row.protein_goal),
        fatGrams: Number(row.fat_goal),
        carbsGrams: Number(row.carbs_goal),
      } : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Calendar Data (workouts + cardio from calendar/getList)
// ---------------------------------------------------------------------------

async function getCalendarData(clientId, tid, startDate, endDate) {
  if (!tid) return null;

  const currentMonday = getCurrentMonday();
  const rangeIsHistorical = endDate < currentMonday;

  // Check if we have workouts+cardio stored for this range
  const existingWorkouts = await pool.query(
    `SELECT MIN(fetched_at) AS oldest FROM client_workouts
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4`,
    [clientId, COACH_ID, startDate, endDate]
  );
  const existingCardio = await pool.query(
    `SELECT MIN(fetched_at) AS oldest FROM client_cardio
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4`,
    [clientId, COACH_ID, startDate, endDate]
  );

  const hasWorkoutData = existingWorkouts.rows[0]?.oldest != null;
  const hasCardioData = existingCardio.rows[0]?.oldest != null;
  const oldestFetch = existingWorkouts.rows[0]?.oldest || existingCardio.rows[0]?.oldest;

  // Calendar data includes scheduled items too, which change over time.
  // Only serve from DB for historical ranges where we've stored data.
  // For current data, always fetch fresh from Trainerize to get scheduled items.
  if ((hasWorkoutData || hasCardioData) && rangeIsHistorical) {
    // Return from DB is tricky - calendar response has a specific shape.
    // We still need to call Trainerize for the full calendar structure (scheduled items).
    // So we only use DB for workout/cardio DETAILS, not the calendar listing itself.
  }

  // Always fetch the calendar listing from Trainerize (it includes scheduled items)
  const result = await trainerizePost('/calendar/getList', {
    userID: Number(tid), startDate, endDate, unitWeight: 'kg',
  }, { label: 'Store' });

  const raw = result.data;

  // Store completed workouts and cardio
  if (raw?.calendar && Array.isArray(raw.calendar)) {
    const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];

    for (const day of raw.calendar) {
      const items = day.items || [];
      for (const item of items) {
        const completed = item.status === 'tracked' || item.status === 'checkedIn';
        if (!completed) continue;

        if (WORKOUT_TYPES.includes(item.type)) {
          await pool.query(
            `INSERT INTO client_workouts (coach_id, client_id, date, name, status, type, trainerize_id, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
               status = EXCLUDED.status, fetched_at = now()`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.type, item.id]
          );
        } else if (item.type === 'cardio') {
          await pool.query(
            `INSERT INTO client_cardio (coach_id, client_id, date, name, status, trainerize_id, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
               status = EXCLUDED.status, fetched_at = now()`,
            [COACH_ID, clientId, day.date, item.title, item.status, item.id]
          );
        }
      }
    }
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Workout Details (from dailyWorkout/get)
// ---------------------------------------------------------------------------

async function getWorkoutDetails(clientId, workoutIds) {
  if (workoutIds.length === 0) return [];

  // Check which ones we already have in DB with detail_json
  const existing = await pool.query(
    `SELECT trainerize_id, detail_json FROM client_workouts
     WHERE client_id = $1 AND coach_id = $2 AND trainerize_id = ANY($3) AND detail_json IS NOT NULL`,
    [clientId, COACH_ID, workoutIds]
  );

  const dbDetails = {};
  for (const row of existing.rows) {
    dbDetails[row.trainerize_id] = row.detail_json;
  }

  // Find IDs missing from DB
  const missingIds = workoutIds.filter(id => !dbDetails[id]);

  // Fetch missing from Trainerize in batches of 20
  if (missingIds.length > 0) {
    for (let i = 0; i < missingIds.length; i += 20) {
      const batch = missingIds.slice(i, i + 20);
      const result = await trainerizePost('/dailyWorkout/get', { ids: batch }, { label: 'Store' });

      if (result.data?.dailyWorkouts) {
        for (const w of result.data.dailyWorkouts) {
          // Store full detail in client_workouts or client_cardio
          const isCardio = w.type === 'cardio';
          const durationSec = w.duration || w.workDuration || null;

          if (isCardio) {
            // Extract distance and maxHR from exercises/trackingStats
            let distance = null;
            let maxHR = w.trackingStats?.stats?.maxHeartRate || null;
            let calories = w.trackingStats?.stats?.calories || null;
            for (const ex of (w.exercises || [])) {
              for (const s of (ex.stats || [])) {
                if (s.distance != null && (distance == null || s.distance > distance)) distance = s.distance;
              }
            }

            await pool.query(
              `INSERT INTO client_cardio
               (coach_id, client_id, date, name, status, trainerize_id, duration_seconds, distance, calories, max_heart_rate, fetched_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
               ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
                 duration_seconds = EXCLUDED.duration_seconds, distance = EXCLUDED.distance,
                 calories = EXCLUDED.calories, max_heart_rate = EXCLUDED.max_heart_rate,
                 status = EXCLUDED.status, fetched_at = now()`,
              [COACH_ID, clientId, w.date, w.name, w.status, w.id, durationSec, distance, calories, maxHR]
            );
          } else {
            await pool.query(
              `INSERT INTO client_workouts
               (coach_id, client_id, date, name, status, type, trainerize_id, duration_seconds, detail_json, fetched_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
               ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
                 duration_seconds = EXCLUDED.duration_seconds, detail_json = EXCLUDED.detail_json,
                 status = EXCLUDED.status, fetched_at = now()`,
              [COACH_ID, clientId, w.date, w.name, w.status, w.type, w.id, durationSec, JSON.stringify(w)]
            );
          }

          dbDetails[w.id] = w;
        }
      }
    }
  }

  // Build result array matching Trainerize response shape
  const allWorkouts = [];
  for (const id of workoutIds) {
    const detail = dbDetails[id];
    if (detail) {
      // detail might be a JSON object from DB or a raw Trainerize response
      allWorkouts.push(typeof detail === 'string' ? JSON.parse(detail) : detail);
    }
  }

  return allWorkouts;
}

// ---------------------------------------------------------------------------
// Upsert helpers for webhook handlers
// ---------------------------------------------------------------------------

async function upsertBodyStat(trainerizeUserId, date, bodystatData) {
  const clientResult = await pool.query(
    `SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
    [String(trainerizeUserId), COACH_ID]
  );
  if (clientResult.rows.length === 0) return;
  const clientId = clientResult.rows[0].id;

  // Fetch full bodystats from API (webhook only has partial data)
  const result = await trainerizePost('/bodystats/get', {
    userID: Number(trainerizeUserId), date, unitWeight: 'kg', unitBodystats: 'cm',
  }, { label: 'Webhook', useCache: false });

  if (!result.data || result.data.code !== 200 || !result.data.bodyMeasures) return;
  const bm = result.data.bodyMeasures;

  await pool.query(
    `INSERT INTO client_body_stats
     (coach_id, client_id, date, body_weight, body_fat_percent, lean_body_mass, fat_mass,
      chest, shoulders, right_bicep, left_bicep, right_forearm, left_forearm,
      right_thigh, left_thigh, right_calf, left_calf, waist, hips, neck,
      blood_pressure_systolic, blood_pressure_diastolic, caliper_bf, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())
     ON CONFLICT (coach_id, client_id, date) DO UPDATE SET
       body_weight = EXCLUDED.body_weight, body_fat_percent = EXCLUDED.body_fat_percent,
       lean_body_mass = EXCLUDED.lean_body_mass, fat_mass = EXCLUDED.fat_mass,
       chest = EXCLUDED.chest, shoulders = EXCLUDED.shoulders,
       right_bicep = EXCLUDED.right_bicep, left_bicep = EXCLUDED.left_bicep,
       right_forearm = EXCLUDED.right_forearm, left_forearm = EXCLUDED.left_forearm,
       right_thigh = EXCLUDED.right_thigh, left_thigh = EXCLUDED.left_thigh,
       right_calf = EXCLUDED.right_calf, left_calf = EXCLUDED.left_calf,
       waist = EXCLUDED.waist, hips = EXCLUDED.hips, neck = EXCLUDED.neck,
       blood_pressure_systolic = EXCLUDED.blood_pressure_systolic,
       blood_pressure_diastolic = EXCLUDED.blood_pressure_diastolic,
       caliper_bf = EXCLUDED.caliper_bf, fetched_at = now()`,
    [COACH_ID, clientId, bm.date || date,
     bm.bodyWeight, bm.bodyFatPercent, bm.leanBodyMass, bm.fatMass,
     bm.chest, bm.shoulders, bm.rightBicep, bm.leftBicep,
     bm.rightForearm, bm.leftForearm, bm.rightThigh, bm.leftThigh,
     bm.rightCalf, bm.leftCalf, bm.waist, bm.hips, bm.neck,
     bm.bloodPressureSystolic, bm.bloodPressureDiastolic, bm.caliperBF]
  );

  console.log(`[Store] Body stat upserted for client ${clientId} on ${date}`);
}

async function upsertWorkout(trainerizeUserId, dailyWorkoutId) {
  const clientResult = await pool.query(
    `SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
    [String(trainerizeUserId), COACH_ID]
  );
  if (clientResult.rows.length === 0) return;
  const clientId = clientResult.rows[0].id;

  const result = await trainerizePost('/dailyWorkout/get', {
    ids: [dailyWorkoutId],
  }, { label: 'Webhook', useCache: false });

  if (!result.data?.dailyWorkouts?.length) return;
  const w = result.data.dailyWorkouts[0];
  const durationSec = w.duration || w.workDuration || null;

  await pool.query(
    `INSERT INTO client_workouts
     (coach_id, client_id, date, name, status, type, trainerize_id, duration_seconds, detail_json, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
       status = EXCLUDED.status, duration_seconds = EXCLUDED.duration_seconds,
       detail_json = EXCLUDED.detail_json, fetched_at = now()`,
    [COACH_ID, clientId, w.date, w.name, w.status, w.type, w.id, durationSec, JSON.stringify(w)]
  );

  console.log(`[Store] Workout upserted for client ${clientId}: ${w.name} on ${w.date}`);
}

async function upsertCardio(trainerizeUserId, dailyWorkoutId) {
  const clientResult = await pool.query(
    `SELECT id FROM clients WHERE trainerize_id = $1 AND coach_id = $2`,
    [String(trainerizeUserId), COACH_ID]
  );
  if (clientResult.rows.length === 0) return;
  const clientId = clientResult.rows[0].id;

  const result = await trainerizePost('/dailyWorkout/get', {
    ids: [dailyWorkoutId],
  }, { label: 'Webhook', useCache: false });

  if (!result.data?.dailyWorkouts?.length) return;
  const w = result.data.dailyWorkouts[0];
  const durationSec = w.duration || w.workDuration || null;
  let distance = null;
  let maxHR = w.trackingStats?.stats?.maxHeartRate || null;
  let calories = w.trackingStats?.stats?.calories || null;
  for (const ex of (w.exercises || [])) {
    for (const s of (ex.stats || [])) {
      if (s.distance != null && (distance == null || s.distance > distance)) distance = s.distance;
    }
  }

  await pool.query(
    `INSERT INTO client_cardio
     (coach_id, client_id, date, name, status, trainerize_id, duration_seconds, distance, calories, max_heart_rate, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (coach_id, client_id, trainerize_id) DO UPDATE SET
       status = EXCLUDED.status, duration_seconds = EXCLUDED.duration_seconds,
       distance = EXCLUDED.distance, calories = EXCLUDED.calories,
       max_heart_rate = EXCLUDED.max_heart_rate, fetched_at = now()`,
    [COACH_ID, clientId, w.date, w.name, w.status, w.id, durationSec, distance, calories, maxHR]
  );

  console.log(`[Store] Cardio upserted for client ${clientId}: ${w.name} on ${w.date}`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getBodyStats,
  getSleepData,
  getHealthData,
  getNutritionData,
  getNutritionDetail,
  getCalendarData,
  getWorkoutDetails,
  upsertBodyStat,
  upsertWorkout,
  upsertCardio,
};
