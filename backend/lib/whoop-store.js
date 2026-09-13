/**
 * Whoop data store
 *
 * Fetches from Whoop, maps into client_whoop_daily / client_whoop_workouts,
 * and serves a Whoop-sourced client back to the rest of the portal in the exact
 * shape lib/trainerize-store.js would have returned.
 *
 * That last part is the whole design. The routes and the React components have
 * no idea Whoop exists: they call getSleepData / getHealthData as they always
 * have, and those functions decide which source answers. Adding Whoop therefore
 * touches no route logic and no component, and switching a client back is a
 * single column change.
 *
 * ---------------------------------------------------------------------------
 * Which day is which
 * ---------------------------------------------------------------------------
 * Whoop thinks in cycles, which run wake-to-wake rather than midnight-to-
 * midnight. A cycle starting Tuesday morning carries Tuesday's strain, and the
 * recovery scored from the sleep that ended that morning. So:
 *
 *   date             = the morning he woke   -> recovery, HRV, resting HR, strain
 *   sleep_night_date = the evening he went to bed -> sleep hours, on the tile
 *
 * The split exists because the portal already files sleep by the night it
 * started (parseSleepData in routes/client-overview.js) and every other client
 * is keyed that way. Recovery keeps Whoop's own labelling so it matches his
 * phone. Both are correct; they are just answering different questions.
 */

const pool = require('../db/pool');
const whoop = require('./whoop');

const COACH_ID = whoop.COACH_ID;
const TZ = 'Europe/Dublin';

// How long a day's data is trusted before a fresh pull. Recovery lands once a
// morning, so anything under an hour is courtesy rather than necessity.
const FRESH_MS = 30 * 60 * 1000;

const DEFAULT_BACKFILL_MONTHS = 6;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function dublinDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}

function dublinHour(date) {
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone: TZ, hour: 'numeric', hour12: false,
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === 'hour').value, 10);
}

/**
 * Parse Whoop's timezone offset ("+10:00", "-05:00") into minutes.
 * Returns null for anything unrecognised, which falls the caller back to
 * Dublin.
 */
function offsetMinutes(offset) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset || '').trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** A date shifted into a fixed UTC offset, so UTC getters read as local time. */
function shifted(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

/**
 * The night a sleep belongs to, decided WHERE THE CLIENT IS.
 *
 * The rule itself matches parseSleepData in routes/client-overview.js: a sleep
 * starting before local noon is credited to the previous day, so 1am Tuesday is
 * "Monday night". What differs is whose noon.
 *
 * parseSleepData uses Dublin's, which is right for a coach in Ireland reading a
 * client in Ireland. It is wrong the moment a client is not. Cian is in
 * Australia and goes to bed around 22:00 his time, which reads as 13:00 in
 * Dublin - only an hour clear of the boundary. On 25 Oct 2026, when Ireland
 * leaves summer time, the same bedtime would have read as 11:00 Dublin, tripped
 * the "before noon" rule, and silently shifted every one of his nights a day
 * out of line with the recovery it produced.
 *
 * So the offset Whoop reports for that night wins, and Dublin is only the
 * fallback for a record that arrives without one.
 */
function sleepNightDate(start, offset) {
  const mins = offsetMinutes(offset);

  if (mins == null) {
    if (dublinHour(start) < 12) {
      const prev = new Date(start);
      prev.setUTCDate(prev.getUTCDate() - 1);
      return dublinDate(prev);
    }
    return dublinDate(start);
  }

  const local = shifted(start, mins);
  if (local.getUTCHours() < 12) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().split('T')[0];
}

/** The client's own calendar date for an instant. */
function localDate(date, offset) {
  const mins = offsetMinutes(offset);
  if (mins == null) return dublinDate(date);
  return shifted(date, mins).toISOString().split('T')[0];
}

/** Whoop wants ISO 8601; the portal passes YYYY-MM-DD around. */
function toInstant(dateStr, endOfDay = false) {
  return `${dateStr}T${endOfDay ? '23:59:59.999Z' : '00:00:00.000Z'}`;
}

function ms(value) {
  return value == null ? null : Math.round(Number(value) / 1000);
}

function kjToKcal(kilojoule) {
  return kilojoule == null ? null : Math.round(Number(kilojoule) / 4.184);
}

// ---------------------------------------------------------------------------
// Is this client on Whoop?
// ---------------------------------------------------------------------------

// getSleepData and getHealthData both ask this, and a single Overview load
// calls them several times over. Cached briefly so one page view is one lookup
// rather than a dozen. Short enough that flipping a client's source in the UI
// takes effect while the coach is still looking at the page.
const sourceCache = new Map();
const SOURCE_TTL_MS = 30 * 1000;

async function usesWhoop(clientDbId) {
  const key = String(clientDbId);
  const hit = sourceCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { rows } = await pool.query(
    `SELECT health_source FROM clients WHERE id = $1 AND coach_id = $2`,
    [clientDbId, COACH_ID]
  );
  const value = rows[0]?.health_source === 'whoop';
  sourceCache.set(key, { value, expires: Date.now() + SOURCE_TTL_MS });
  return value;
}

/** Called after a source change so the next read is not served a stale answer. */
function forgetSource(clientDbId) {
  sourceCache.delete(String(clientDbId));
}

// ---------------------------------------------------------------------------
// Fetch and store
// ---------------------------------------------------------------------------

/**
 * Pull a date range from Whoop and write it down.
 *
 * Never throws at the caller. A Whoop outage must not take a coach's dashboard
 * with it, so failures are recorded on the connection and the stored data is
 * served as-is - the same "fail gracefully, surface clearly" rule the
 * Trainerize calls follow.
 */
async function sync(clientDbId, startDate, endDate) {
  const connection = await whoop.getConnection(clientDbId);
  if (!connection) return { ok: false, reason: 'not_connected' };

  const start = toInstant(startDate);
  const end = toInstant(endDate, true);

  try {
    // Cycles first: they define which calendar day every other record lands on.
    const cycles = await whoop.getAll(connection, '/v2/cycle', { start, end });

    const dayByCycle = new Map();
    const days = new Map();

    function dayFor(date) {
      if (!days.has(date)) days.set(date, { date });
      return days.get(date);
    }

    for (const cycle of cycles) {
      if (!cycle?.start) continue;
      // Whoop already starts a cycle at the client's local wake time, so its
      // own offset is the only correct way to name that day.
      const date = localDate(new Date(cycle.start), cycle.timezone_offset);
      dayByCycle.set(cycle.id, date);

      const day = dayFor(date);
      day.cycle_id = cycle.id;
      if (cycle.score_state === 'SCORED' && cycle.score) {
        day.day_strain    = cycle.score.strain ?? null;
        day.calories_kcal = kjToKcal(cycle.score.kilojoule);
        day.avg_hr        = cycle.score.average_heart_rate ?? null;
        day.max_hr        = cycle.score.max_heart_rate ?? null;
      }
    }

    // Recovery hangs off a cycle, so it inherits that cycle's day.
    const recoveries = await whoop.getAll(connection, '/v2/recovery', { start, end });
    for (const rec of recoveries) {
      const date = dayByCycle.get(rec?.cycle_id);
      if (!date) continue;
      const day = dayFor(date);
      if (rec.score_state === 'SCORED' && rec.score) {
        // While Whoop is still calibrating a new strap the scores are
        // meaningless. Recorded, but flagged so the dashboard can leave them
        // out rather than draw a cliff edge that never happened.
        day.recovery_calibrating = Boolean(rec.score.user_calibrating);
        day.recovery_score = rec.score.recovery_score ?? null;
        day.hrv_ms         = rec.score.hrv_rmssd_milli ?? null;
        day.resting_hr     = rec.score.resting_heart_rate ?? null;
        day.spo2_percent   = rec.score.spo2_percentage ?? null;
        day.skin_temp_c    = rec.score.skin_temp_celsius ?? null;
      }
    }

    // Sleep is keyed on the morning it ended, and separately records the night
    // it began so the sleep tile keeps the portal's existing convention.
    const sleeps = await whoop.getAll(connection, '/v2/activity/sleep', { start, end });
    for (const sleep of sleeps) {
      if (!sleep?.start || !sleep?.end) continue;
      const startedAt = new Date(sleep.start);
      const endedAt = new Date(sleep.end);
      const date = localDate(endedAt, sleep.timezone_offset);
      const day = dayFor(date);

      const score = sleep.score_state === 'SCORED' ? sleep.score : null;
      const stages = score?.stage_summary || null;

      if (sleep.nap) {
        // Naps are context, never the headline. Accumulated so an odd day has
        // an explanation, but kept out of the night's totals.
        const light = ms(stages?.total_light_sleep_time_milli) || 0;
        const deep  = ms(stages?.total_slow_wave_sleep_time_milli) || 0;
        const rem   = ms(stages?.total_rem_sleep_time_milli) || 0;
        day.nap_seconds = (day.nap_seconds || 0) + light + deep + rem;
        continue;
      }

      day.sleep_night_date = sleepNightDate(startedAt, sleep.timezone_offset);
      day.timezone_offset = sleep.timezone_offset || null;
      day.sleep_uuid  = sleep.id || null;
      day.sleep_start = startedAt.toISOString();
      day.sleep_end   = endedAt.toISOString();

      if (stages) {
        const light = ms(stages.total_light_sleep_time_milli) || 0;
        const deep  = ms(stages.total_slow_wave_sleep_time_milli) || 0;
        const rem   = ms(stages.total_rem_sleep_time_milli) || 0;

        day.light_seconds = light;
        day.deep_seconds  = deep;
        day.rem_seconds   = rem;
        day.awake_seconds = ms(stages.total_awake_time_milli);
        // Time actually asleep, which is what Whoop shows as "hours of sleep".
        // Deliberately not in-bed time, so it matches his app.
        day.sleep_seconds = light + deep + rem;
        day.sleep_cycles  = stages.sleep_cycle_count ?? null;
        day.disturbances  = stages.disturbance_count ?? null;
      }

      if (score) {
        day.sleep_performance = score.sleep_performance_percentage ?? null;
        day.sleep_consistency = score.sleep_consistency_percentage ?? null;
        day.sleep_efficiency  = score.sleep_efficiency_percentage ?? null;
        day.respiratory_rate  = score.respiratory_rate ?? null;
        const need = score.sleep_needed;
        if (need) {
          day.sleep_needed_seconds =
            (ms(need.baseline_milli) || 0) +
            (ms(need.need_from_sleep_debt_milli) || 0) +
            (ms(need.need_from_recent_strain_milli) || 0) -
            (ms(need.need_from_recent_nap_milli) || 0);
        }
      }
    }

    for (const day of days.values()) {
      await upsertDay(clientDbId, day);
    }

    const workouts = await whoop.getAll(connection, '/v2/activity/workout', { start, end });
    for (const workout of workouts) {
      await upsertWorkout(clientDbId, workout);
    }

    await pool.query(
      `UPDATE client_whoop_connections
       SET last_sync_at = now(), last_sync_error = NULL
       WHERE id = $1`,
      [connection.id]
    );

    return { ok: true, days: days.size, workouts: workouts.length };
  } catch (err) {
    // A revoked connection is a fact about the world, not a transient error:
    // record it so the client's page can say "reconnect" rather than showing a
    // spinner forever.
    if (err instanceof whoop.WhoopError && err.revoked) {
      await whoop.markRevoked(connection.id, err.message);
      console.warn(`[Whoop] client ${clientDbId} has revoked access`);
      return { ok: false, reason: 'revoked' };
    }
    console.error(`[Whoop] sync failed for client ${clientDbId}:`, err.message);
    await pool.query(
      `UPDATE client_whoop_connections SET last_sync_error = $2 WHERE id = $1`,
      [connection.id, err.message.slice(0, 500)]
    ).catch(() => {});
    return { ok: false, reason: 'error', error: err.message };
  }
}

async function upsertDay(clientDbId, day) {
  await pool.query(
    `INSERT INTO client_whoop_daily (
       coach_id, client_id, date,
       recovery_score, hrv_ms, resting_hr, spo2_percent, skin_temp_c, recovery_calibrating,
       day_strain, calories_kcal, avg_hr, max_hr,
       sleep_night_date, sleep_start, sleep_end, sleep_seconds, sleep_needed_seconds,
       sleep_performance, sleep_consistency, sleep_efficiency,
       rem_seconds, deep_seconds, light_seconds, awake_seconds,
       sleep_cycles, disturbances, respiratory_rate, nap_seconds,
       cycle_id, sleep_uuid, timezone_offset, fetched_at
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20, $21,
       $22, $23, $24, $25,
       $26, $27, $28, $29,
       $30, $31, $32, now()
     )
     ON CONFLICT (coach_id, client_id, date) DO UPDATE SET
       -- COALESCE keeps an earlier value when this pass did not carry one.
       -- Recovery and sleep arrive on different calls and sometimes hours
       -- apart, so a straight overwrite would have each one wiping the other.
       recovery_score       = COALESCE(EXCLUDED.recovery_score, client_whoop_daily.recovery_score),
       hrv_ms               = COALESCE(EXCLUDED.hrv_ms, client_whoop_daily.hrv_ms),
       resting_hr           = COALESCE(EXCLUDED.resting_hr, client_whoop_daily.resting_hr),
       spo2_percent         = COALESCE(EXCLUDED.spo2_percent, client_whoop_daily.spo2_percent),
       skin_temp_c          = COALESCE(EXCLUDED.skin_temp_c, client_whoop_daily.skin_temp_c),
       recovery_calibrating = EXCLUDED.recovery_calibrating OR client_whoop_daily.recovery_calibrating,
       day_strain           = COALESCE(EXCLUDED.day_strain, client_whoop_daily.day_strain),
       calories_kcal        = COALESCE(EXCLUDED.calories_kcal, client_whoop_daily.calories_kcal),
       avg_hr               = COALESCE(EXCLUDED.avg_hr, client_whoop_daily.avg_hr),
       max_hr               = COALESCE(EXCLUDED.max_hr, client_whoop_daily.max_hr),
       sleep_night_date     = COALESCE(EXCLUDED.sleep_night_date, client_whoop_daily.sleep_night_date),
       sleep_start          = COALESCE(EXCLUDED.sleep_start, client_whoop_daily.sleep_start),
       sleep_end            = COALESCE(EXCLUDED.sleep_end, client_whoop_daily.sleep_end),
       sleep_seconds        = COALESCE(EXCLUDED.sleep_seconds, client_whoop_daily.sleep_seconds),
       sleep_needed_seconds = COALESCE(EXCLUDED.sleep_needed_seconds, client_whoop_daily.sleep_needed_seconds),
       sleep_performance    = COALESCE(EXCLUDED.sleep_performance, client_whoop_daily.sleep_performance),
       sleep_consistency    = COALESCE(EXCLUDED.sleep_consistency, client_whoop_daily.sleep_consistency),
       sleep_efficiency     = COALESCE(EXCLUDED.sleep_efficiency, client_whoop_daily.sleep_efficiency),
       rem_seconds          = COALESCE(EXCLUDED.rem_seconds, client_whoop_daily.rem_seconds),
       deep_seconds         = COALESCE(EXCLUDED.deep_seconds, client_whoop_daily.deep_seconds),
       light_seconds        = COALESCE(EXCLUDED.light_seconds, client_whoop_daily.light_seconds),
       awake_seconds        = COALESCE(EXCLUDED.awake_seconds, client_whoop_daily.awake_seconds),
       sleep_cycles         = COALESCE(EXCLUDED.sleep_cycles, client_whoop_daily.sleep_cycles),
       disturbances         = COALESCE(EXCLUDED.disturbances, client_whoop_daily.disturbances),
       respiratory_rate     = COALESCE(EXCLUDED.respiratory_rate, client_whoop_daily.respiratory_rate),
       nap_seconds          = COALESCE(EXCLUDED.nap_seconds, client_whoop_daily.nap_seconds),
       cycle_id             = COALESCE(EXCLUDED.cycle_id, client_whoop_daily.cycle_id),
       sleep_uuid           = COALESCE(EXCLUDED.sleep_uuid, client_whoop_daily.sleep_uuid),
       timezone_offset      = COALESCE(EXCLUDED.timezone_offset, client_whoop_daily.timezone_offset),
       fetched_at           = now()`,
    [
      COACH_ID, clientDbId, day.date,
      day.recovery_score ?? null, day.hrv_ms ?? null, day.resting_hr ?? null,
      day.spo2_percent ?? null, day.skin_temp_c ?? null, day.recovery_calibrating ?? false,
      day.day_strain ?? null, day.calories_kcal ?? null, day.avg_hr ?? null, day.max_hr ?? null,
      day.sleep_night_date ?? null, day.sleep_start ?? null, day.sleep_end ?? null,
      day.sleep_seconds ?? null, day.sleep_needed_seconds ?? null,
      day.sleep_performance ?? null, day.sleep_consistency ?? null, day.sleep_efficiency ?? null,
      day.rem_seconds ?? null, day.deep_seconds ?? null, day.light_seconds ?? null,
      day.awake_seconds ?? null, day.sleep_cycles ?? null, day.disturbances ?? null,
      day.respiratory_rate ?? null, day.nap_seconds ?? null,
      day.cycle_id ?? null, day.sleep_uuid ?? null, day.timezone_offset ?? null,
    ]
  );
}

/** Whoop names a few sports and returns a bare id for the rest. */
function sportName(workout) {
  if (workout.sport_name) return String(workout.sport_name);
  if (workout.sport_id != null) return `Sport ${workout.sport_id}`;
  return null;
}

async function upsertWorkout(clientDbId, workout) {
  if (!workout?.id || !workout.start) return;
  const startedAt = new Date(workout.start);
  const endedAt = workout.end ? new Date(workout.end) : null;
  const score = workout.score_state === 'SCORED' ? workout.score : null;

  await pool.query(
    `INSERT INTO client_whoop_workouts (
       coach_id, client_id, date, whoop_id, sport, start_time, end_time,
       duration_seconds, strain, avg_hr, max_hr, calories_kcal, distance_m,
       zone_json, fetched_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (coach_id, client_id, whoop_id) DO UPDATE SET
       sport            = EXCLUDED.sport,
       end_time         = EXCLUDED.end_time,
       duration_seconds = EXCLUDED.duration_seconds,
       strain           = EXCLUDED.strain,
       avg_hr           = EXCLUDED.avg_hr,
       max_hr           = EXCLUDED.max_hr,
       calories_kcal    = EXCLUDED.calories_kcal,
       distance_m       = EXCLUDED.distance_m,
       zone_json        = EXCLUDED.zone_json,
       fetched_at       = now()`,
    [
      COACH_ID, clientDbId, dublinDate(startedAt), String(workout.id),
      sportName(workout),
      startedAt.toISOString(), endedAt ? endedAt.toISOString() : null,
      endedAt ? Math.round((endedAt - startedAt) / 1000) : null,
      score?.strain ?? null, score?.average_heart_rate ?? null, score?.max_heart_rate ?? null,
      kjToKcal(score?.kilojoule), score?.distance_meter ?? null,
      score?.zone_durations ? JSON.stringify(score.zone_durations) : null,
    ]
  );
}

/** First pull after a client connects. */
async function backfill(clientDbId, months = DEFAULT_BACKFILL_MONTHS) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);

  const result = await sync(clientDbId, dublinDate(start), dublinDate(end));
  if (result.ok) {
    await pool.query(
      `UPDATE client_whoop_connections SET backfill_done = true
       WHERE client_id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
  }
  return result;
}

/** Pull anything new. Called by the scheduler and when a client page opens. */
async function refreshIfStale(clientDbId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT last_sync_at FROM client_whoop_connections
     WHERE client_id = $1 AND coach_id = $2 AND revoked_at IS NULL`,
    [clientDbId, COACH_ID]
  );
  if (rows.length === 0) return { ok: false, reason: 'not_connected' };

  const lastSync = rows[0].last_sync_at ? new Date(rows[0].last_sync_at).getTime() : 0;
  if (Date.now() - lastSync < FRESH_MS) return { ok: true, skipped: true };

  return sync(clientDbId, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Serving the portal
// ---------------------------------------------------------------------------

/**
 * Sleep in the shape routes/client-overview.js and routes/calendar.js expect
 * from Trainerize: { sleep: [{ type, startTime, endTime }] } with naive UTC
 * timestamps.
 *
 * Returning real segments rather than pre-computed hours is what keeps the
 * seam invisible - parseSleepData does its own Dublin conversion and its own
 * bucketing, so a Whoop night lands on exactly the same day a Trainerize night
 * would have.
 */
async function buildSleepResponse(clientDbId, startDate, endDate) {
  // Widened by a day at each end because the night of the 1st is stored against
  // the 2nd. Without this the first and last nights of a range go missing.
  const { rows } = await pool.query(
    `SELECT sleep_start, sleep_end, timezone_offset FROM client_whoop_daily
     WHERE client_id = $1 AND coach_id = $2
       AND sleep_start IS NOT NULL AND sleep_end IS NOT NULL
       AND sleep_night_date >= $3::date - 1
       AND sleep_night_date <= $4::date + 1
     ORDER BY sleep_start`,
    [clientDbId, COACH_ID, startDate, endDate]
  );

  return {
    sleep: rows.map(r => ({
      type: 'asleep',
      startTime: new Date(r.sleep_start).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
      endTime: new Date(r.sleep_end).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
      // The offset the client was actually in. lib/sleep-night.js uses it to
      // decide which night this belongs to; a Trainerize segment has none and
      // falls back to Dublin. Without this the Whoop panel and the sleep tile
      // would disagree about the date of the same night.
      tz: r.timezone_offset || null,
    })),
  };
}

/**
 * Health data in Trainerize's shape.
 *
 * Only restingHeartRate and calorieOut are answered from Whoop. `step` returns
 * null on purpose: Whoop's API has no step count at all, so the caller falls
 * back to Trainerize, which is still receiving steps through Apple Health.
 */
async function buildHealthResponse(clientDbId, type, startDate, endDate) {
  if (type === 'step') return null;

  const column = type === 'restingHeartRate' ? 'resting_hr'
    : type === 'calorieOut' ? 'calories_kcal'
    : null;
  if (!column) return null;

  const { rows } = await pool.query(
    `SELECT date::text AS date, ${column} AS value
     FROM client_whoop_daily
     WHERE client_id = $1 AND coach_id = $2
       AND date >= $3 AND date <= $4
       AND ${column} IS NOT NULL
       ${type === 'restingHeartRate' ? 'AND recovery_calibrating = false' : ''}
     ORDER BY date`,
    [clientDbId, COACH_ID, startDate, endDate]
  );

  const dataKey = type === 'restingHeartRate' ? 'restingHeartRate' : 'calorieOut';
  return {
    healthData: rows.map(r => ({
      date: r.date,
      type,
      data: { [dataKey]: Number(r.value) },
    })),
  };
}

/** The Whoop-only metrics, for the new Overview tiles. */
async function getDaily(clientDbId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT date::text AS date,
            sleep_night_date::text AS sleep_night_date,
            recovery_score, hrv_ms, resting_hr, spo2_percent, skin_temp_c,
            recovery_calibrating, day_strain, calories_kcal, avg_hr, max_hr,
            sleep_seconds, sleep_needed_seconds, sleep_performance,
            sleep_consistency, sleep_efficiency, rem_seconds, deep_seconds,
            light_seconds, awake_seconds, sleep_cycles, disturbances,
            respiratory_rate, nap_seconds, timezone_offset,
            sleep_start, sleep_end
     FROM client_whoop_daily
     WHERE client_id = $1 AND coach_id = $2 AND date >= $3 AND date <= $4
     ORDER BY date`,
    [clientDbId, COACH_ID, startDate, endDate]
  );

  return rows.map(r => ({
    date: r.date,
    sleepNightDate: r.sleep_night_date,
    // Scores recorded while the strap was still calibrating are real numbers
    // that mean nothing, so they are withheld rather than charted.
    recoveryScore: r.recovery_calibrating ? null : numberOrNull(r.recovery_score),
    hrv: r.recovery_calibrating ? null : numberOrNull(r.hrv_ms),
    restingHR: r.recovery_calibrating ? null : (r.resting_hr ?? null),
    calibrating: r.recovery_calibrating,
    spo2: numberOrNull(r.spo2_percent),
    skinTemp: numberOrNull(r.skin_temp_c),
    strain: numberOrNull(r.day_strain),
    calories: r.calories_kcal ?? null,
    avgHR: r.avg_hr ?? null,
    maxHR: r.max_hr ?? null,
    sleepHours: r.sleep_seconds != null ? +(r.sleep_seconds / 3600).toFixed(2) : null,
    sleepNeededHours: r.sleep_needed_seconds != null ? +(r.sleep_needed_seconds / 3600).toFixed(2) : null,
    sleepPerformance: numberOrNull(r.sleep_performance),
    sleepConsistency: numberOrNull(r.sleep_consistency),
    sleepEfficiency: numberOrNull(r.sleep_efficiency),
    remHours: r.rem_seconds != null ? +(r.rem_seconds / 3600).toFixed(2) : null,
    deepHours: r.deep_seconds != null ? +(r.deep_seconds / 3600).toFixed(2) : null,
    lightHours: r.light_seconds != null ? +(r.light_seconds / 3600).toFixed(2) : null,
    awakeHours: r.awake_seconds != null ? +(r.awake_seconds / 3600).toFixed(2) : null,
    sleepCycles: r.sleep_cycles ?? null,
    disturbances: r.disturbances ?? null,
    respiratoryRate: numberOrNull(r.respiratory_rate),
    napHours: r.nap_seconds != null ? +(r.nap_seconds / 3600).toFixed(2) : null,
    timezoneOffset: r.timezone_offset || null,
    // Raw instants. The UI renders them in the CLIENT's offset, because a
    // bedtime is only meaningful where the person actually went to bed.
    sleepStart: r.sleep_start ? new Date(r.sleep_start).toISOString() : null,
    sleepEnd: r.sleep_end ? new Date(r.sleep_end).toISOString() : null,
  }));
}

function numberOrNull(v) {
  return v == null ? null : Number(v);
}

/** Connection state for the client page. */
async function getStatus(clientDbId) {
  const { rows } = await pool.query(
    `SELECT c.health_source,
            w.id, w.whoop_user_id, w.connected_at, w.revoked_at,
            w.backfill_done, w.last_sync_at, w.last_sync_error
     FROM clients c
     LEFT JOIN client_whoop_connections w
       ON w.client_id = c.id AND w.coach_id = c.coach_id
     WHERE c.id = $1 AND c.coach_id = $2`,
    [clientDbId, COACH_ID]
  );
  const row = rows[0];
  if (!row) return null;

  return {
    configured: whoop.isConfigured(),
    healthSource: row.health_source || 'trainerize',
    connected: Boolean(row.id) && !row.revoked_at,
    revoked: Boolean(row.revoked_at),
    connectedAt: row.connected_at || null,
    backfillDone: row.backfill_done || false,
    lastSyncAt: row.last_sync_at || null,
    lastSyncError: row.last_sync_error || null,
  };
}

module.exports = {
  usesWhoop,
  forgetSource,
  sync,
  backfill,
  refreshIfStale,
  buildSleepResponse,
  buildHealthResponse,
  getDaily,
  getStatus,
  dublinDate,
  _test: { sleepNightDate, kjToKcal, offsetMinutes, localDate },
};
