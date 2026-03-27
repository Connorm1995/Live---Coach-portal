/**
 * client-overview.js
 *
 * Combined overview + calendar endpoint for the redesigned Client View.
 * Merges data from overview.js and calendar.js into a single response,
 * with extended training compliance (30/60-day toggle) and 3-week weight comparison.
 */

const express = require('express');
const pool = require('../db/pool');
const { trainerizePost: tzPost } = require('../lib/trainerize');
const store = require('../lib/trainerize-store');
const { parseScores, parseFormAnswers, SCORE_CATEGORIES } = require('../lib/overview-parsers');

const router = express.Router();
const COACH_ID = 1;

// Thin wrapper - return raw data, track timeouts per request
let _timedOutSections = [];
async function trainerizePost(endpoint, body) {
  const result = await tzPost(endpoint, body, { label: 'ClientOverview' });
  if (result.timedOut) _timedOutSections.push(endpoint);
  return result.data;
}

router.use((req, res, next) => {
  _timedOutSections = [];
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (_timedOutSections.length > 0 && body && typeof body === 'object' && !body.error) {
      body.timedOutSections = [...new Set(_timedOutSections)];
    }
    return origJson(body);
  };
  next();
});

// ---------------------------------------------------------------------------
// Date helpers (reused from overview.js)
// ---------------------------------------------------------------------------

function getPreviousFullWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  return {
    start: prevMonday.toISOString().split('T')[0],
    end: prevSunday.toISOString().split('T')[0],
  };
}

function getWeekBefore(weekStartStr) {
  const d = new Date(weekStartStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  return { start: d.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

function getLast10Days() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 9);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getWeightRange(range) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
  start.setUTCMonth(start.getUTCMonth() - (months[range] || 3));
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getCurrentWeekMonday() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  return monday.toISOString().split('T')[0];
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

function getMonthRange(monthStr) {
  let year, month;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    [year, month] = monthStr.split('-').map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate, year, month };
}

// ---------------------------------------------------------------------------
// Trainerize data parsers (reused from overview.js)
// ---------------------------------------------------------------------------

function parseStepsData(response, dateRangeArr) {
  const byDate = {};
  if (response?.healthData) {
    for (const e of response.healthData) {
      if (e.type === 'step' && e.data?.steps != null) {
        byDate[e.date] = e.data.steps;
      }
    }
  }
  return dateRangeArr.map(date => ({ date, count: byDate[date] || 0 }));
}

function parseRestingHR(response) {
  if (!response?.healthData) return [];
  return response.healthData
    .filter(e => e.type === 'restingHeartRate' && e.data?.restingHeartRate != null)
    .map(e => ({ date: e.date, bpm: e.data.restingHeartRate }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseSleepData(response, dateRangeArr) {
  const TZ = 'Europe/Dublin';

  function toLocalTimeStr(date) {
    return new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  }

  function toLocalDateStr(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const p = {};
    for (const { type, value } of parts) p[type] = value;
    return `${p.year}-${p.month}-${p.day}`;
  }

  function toLocalHour(date) {
    const parts = new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ, hour: 'numeric', hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    return parseInt(hourPart.value, 10);
  }

  const nights = {};
  if (response?.sleep && Array.isArray(response.sleep)) {
    for (const seg of response.sleep) {
      if (seg.type !== 'asleep') continue;
      const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
      const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
      const durationMin = (end - start) / 60000;
      if (durationMin <= 0) continue;

      const localHour = toLocalHour(start);
      let nightDate;
      if (localHour < 12) {
        const prev = new Date(start);
        prev.setUTCDate(prev.getUTCDate() - 1);
        nightDate = toLocalDateStr(prev);
      } else {
        nightDate = toLocalDateStr(start);
      }

      if (!nights[nightDate]) {
        nights[nightDate] = { totalMin: 0, earliestStart: start, latestEnd: end };
      }
      nights[nightDate].totalMin += durationMin;
      if (start < nights[nightDate].earliestStart) nights[nightDate].earliestStart = start;
      if (end > nights[nightDate].latestEnd) nights[nightDate].latestEnd = end;
    }
  }

  return dateRangeArr.map(date => {
    const data = nights[date];
    if (data) {
      return {
        date,
        hours: Number((data.totalMin / 60).toFixed(1)),
        bedtime: toLocalTimeStr(data.earliestStart),
        wakeTime: toLocalTimeStr(data.latestEnd),
      };
    }
    return { date, hours: 0, bedtime: null, wakeTime: null };
  });
}

function parseTrainingData(response) {
  const empty = { weightSessions: { completed: 0, programmed: 0 }, cardioSessions: 0 };
  if (!response) return empty;
  const calendar = response.calendar || [];
  if (!Array.isArray(calendar)) return empty;
  const allItems = calendar.flatMap(day => day.items || []);
  const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];
  const workouts = allItems.filter(item => WORKOUT_TYPES.includes(item.type));
  const cardio = allItems.filter(item => item.type === 'cardio');
  return {
    weightSessions: {
      completed: workouts.filter(w => w.status === 'tracked' || w.status === 'checkedIn').length,
      programmed: workouts.length,
    },
    cardioSessions: cardio.filter(w => w.status === 'tracked' || w.status === 'checkedIn').length,
  };
}

function parseNutritionData(response) {
  if (!response) return [];
  const days = response.nutrition || response.days || [];
  if (!Array.isArray(days)) return [];
  return days
    .map(d => {
      const cal = d.calories || 0;
      const goal = d.goal?.caloricGoal || 0;
      const pct = goal > 0 ? Math.round((cal / goal) * 100) : 0;
      return { date: d.date, tracked: cal > 0, caloriePercent: pct };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ---------------------------------------------------------------------------
// Step 5: Extended 3-week weight comparison
// ---------------------------------------------------------------------------

function buildWeightComparison3Weeks(weightEntries, prevWeek) {
  const week2 = getWeekBefore(prevWeek.start);
  const week3 = getWeekBefore(week2.start);

  const avg = (arr) => arr.length > 0
    ? Number((arr.reduce((s, e) => s + e.weight, 0) / arr.length).toFixed(1))
    : null;

  const weeks = [
    { range: prevWeek, label: `${prevWeek.start} - ${prevWeek.end}` },
    { range: week2, label: `${week2.start} - ${week2.end}` },
    { range: week3, label: `${week3.start} - ${week3.end}` },
  ].map(({ range, label }) => {
    const entries = weightEntries.filter(e => e.date >= range.start && e.date <= range.end);
    return {
      label,
      average: avg(entries),
      count: entries.length,
      dates: entries.map(e => e.date),
    };
  });

  // Deltas between consecutive weeks (index 0 = week1 vs week2, index 1 = week2 vs week3)
  const deltas = [];
  for (let i = 0; i < weeks.length - 1; i++) {
    const a = weeks[i].average;
    const b = weeks[i + 1].average;
    deltas.push(a != null && b != null ? Number((a - b).toFixed(1)) : null);
  }

  return { weeks, deltas };
}

// ---------------------------------------------------------------------------
// Step 4: Extended training compliance for 30/60-day toggle
// ---------------------------------------------------------------------------

async function buildTrainingCompliance(clientId, complianceRange) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - complianceRange);

  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  // Query completed strength sessions from client_workouts in the date range
  const workoutResult = await pool.query(
    `SELECT COUNT(*) AS completed FROM client_workouts
     WHERE client_id = $1 AND coach_id = $2
       AND date >= $3 AND date <= $4
       AND status IN ('tracked', 'checkedIn')`,
    [clientId, COACH_ID, startDate, endDate]
  );

  // Query programmed workouts (all statuses) from client_workouts
  const programmedResult = await pool.query(
    `SELECT COUNT(*) AS programmed FROM client_workouts
     WHERE client_id = $1 AND coach_id = $2
       AND date >= $3 AND date <= $4`,
    [clientId, COACH_ID, startDate, endDate]
  );

  // Count cardio sessions from client_cardio
  const cardioResult = await pool.query(
    `SELECT COUNT(*) AS cardio FROM client_cardio
     WHERE client_id = $1 AND coach_id = $2
       AND date >= $3 AND date <= $4
       AND status IN ('tracked', 'checkedIn')`,
    [clientId, COACH_ID, startDate, endDate]
  );

  return {
    weightSessions: {
      completed: parseInt(workoutResult.rows[0].completed, 10),
      programmed: parseInt(programmedResult.rows[0].programmed, 10),
    },
    cardioSessions: parseInt(cardioResult.rows[0].cardio, 10),
    range: complianceRange,
  };
}

// ---------------------------------------------------------------------------
// Calendar day-building logic (reused from calendar.js)
// ---------------------------------------------------------------------------

const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];
const WALKING_NAMES = ['walking', 'walk', 'hiking', 'hike'];

function isWalkingSession(name) {
  return WALKING_NAMES.some(w => name.toLowerCase().includes(w));
}

function walkingMeetsThreshold(workoutDetail) {
  const stats = workoutDetail?.trackingStats?.stats || {};
  if (stats.maxHeartRate != null && stats.maxHeartRate > 100) return true;
  for (const ex of (workoutDetail?.exercises || [])) {
    for (const s of (ex.stats || [])) {
      if (s.distance != null && s.distance > 3) return true;
      if (s.time != null && s.time > 2700) return true;
    }
  }
  return false;
}

function extractActivityMeta(workoutDetail) {
  let totalDuration = 0;
  let totalDistance = 0;
  for (const ex of (workoutDetail?.exercises || [])) {
    for (const s of (ex.stats || [])) {
      if (s.time != null) totalDuration += s.time;
      if (s.distance != null) totalDistance += s.distance;
    }
  }
  const trackingDuration = workoutDetail?.trackingStats?.stats?.duration;
  if (trackingDuration && trackingDuration > totalDuration) totalDuration = trackingDuration;
  return {
    duration: totalDuration > 0 ? totalDuration : null,
    distance: totalDistance > 0 ? Math.round(totalDistance * 100) / 100 : null,
  };
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Calendar sleep parser (simpler than overview version - just hours per date)
function parseCalendarSleepData(response, allDates) {
  const TZ = 'Europe/Dublin';

  function toLocalHour(date) {
    const parts = new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ, hour: 'numeric', hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    return parseInt(hourPart.value, 10);
  }

  function toLocalDateStr(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const p = {};
    for (const { type, value } of parts) p[type] = value;
    return `${p.year}-${p.month}-${p.day}`;
  }

  const nights = {};
  if (response?.sleep && Array.isArray(response.sleep)) {
    for (const seg of response.sleep) {
      if (seg.type !== 'asleep') continue;
      const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
      const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
      const durationMin = (end - start) / 60000;
      if (durationMin <= 0) continue;

      const localHour = toLocalHour(start);
      let nightDate;
      if (localHour < 12) {
        const prev = new Date(start);
        prev.setUTCDate(prev.getUTCDate() - 1);
        nightDate = toLocalDateStr(prev);
      } else {
        nightDate = toLocalDateStr(start);
      }

      if (!nights[nightDate]) nights[nightDate] = { totalMin: 0 };
      nights[nightDate].totalMin += durationMin;
    }
  }

  const result = {};
  for (const date of allDates) {
    const data = nights[date];
    if (data && data.totalMin > 0) {
      result[date] = Number((data.totalMin / 60).toFixed(1));
    }
  }
  return result;
}

async function buildCalendarDays(clientId, tid, monthRange) {
  const allDates = dateRange(monthRange.startDate, monthRange.endDate);

  const [calendarData, nutritionData, sleepData, weightEntries] = await Promise.all([
    store.getCalendarData(clientId, tid, monthRange.startDate, monthRange.endDate),
    store.getNutritionData(clientId, tid, monthRange.startDate, monthRange.endDate),
    store.getSleepData(clientId, tid, monthRange.startDate, monthRange.endDate),
    store.getBodyStats(clientId, tid, monthRange.startDate, monthRange.endDate),
  ]);

  if (!calendarData?.calendar) return [];

  // Build lookup maps
  const nutritionMap = {};
  if (nutritionData?.nutrition && Array.isArray(nutritionData.nutrition)) {
    for (const day of nutritionData.nutrition) {
      if (day.date) {
        const calories = Math.round(day.calories || 0);
        const calorieGoal = day.goal?.caloricGoal || 0;
        const insufficientTracking = calorieGoal > 0 && calories < calorieGoal * 0.65;
        nutritionMap[day.date] = { calories, protein: Math.round(day.proteinGrams || 0), insufficientTracking };
      }
    }
  }

  const sleepMap = parseCalendarSleepData(sleepData, allDates);

  const weightMap = {};
  for (const entry of weightEntries) {
    if (entry.date && entry.weight != null) weightMap[entry.date] = entry.weight;
  }

  // Parse calendar items
  const dayMap = {};
  const walkingIds = [];
  const cardioIds = [];

  for (const day of calendarData.calendar) {
    const date = day.date;
    if (!date) continue;
    const items = day.items || [];
    if (!dayMap[date]) dayMap[date] = { date, activities: [], bodyStatsLogged: false };

    for (const item of items) {
      const isWorkout = WORKOUT_TYPES.includes(item.type);
      const isCardio = item.type === 'cardio';
      const isBodystat = item.type === 'bodystat';

      if (isBodystat) { dayMap[date].bodyStatsLogged = true; continue; }
      if (!isWorkout && !isCardio) continue;

      const completed = item.status === 'tracked' || item.status === 'checkedIn';
      const name = item.title || 'Session';

      if (isWorkout) {
        dayMap[date].activities.push({ id: item.id, type: 'strength', name, status: completed ? 'completed' : 'scheduled' });
      } else if (isCardio) {
        const isWalking = isWalkingSession(name);
        if (isWalking && completed) walkingIds.push(item.id);
        if (completed) cardioIds.push(item.id);
        dayMap[date].activities.push({
          id: item.id, type: isWalking ? 'walking' : 'cardio', name,
          status: completed ? 'completed' : 'scheduled',
          _pendingWalkingFilter: isWalking && completed,
          _needsMeta: completed,
        });
      }
    }
  }

  // Fetch details for walking filter + cardio meta
  const detailIds = [...new Set([...walkingIds, ...cardioIds])];
  const details = await store.getWorkoutDetails(clientId, detailIds);
  const detailMap = {};
  for (const d of details) detailMap[d.id] = d;

  // Apply walking filter and enrich
  const days = [];
  for (const date of Object.keys(dayMap).sort()) {
    const dayData = dayMap[date];
    const filteredActivities = [];

    for (const activity of dayData.activities) {
      if (activity._pendingWalkingFilter) {
        const detail = detailMap[activity.id];
        if (!detail || !walkingMeetsThreshold(detail)) continue;
      }
      if (activity.type === 'walking' && activity.status === 'scheduled') continue;

      if (activity._needsMeta && detailMap[activity.id]) {
        const meta = extractActivityMeta(detailMap[activity.id]);
        if (meta.duration) activity.duration = formatDuration(meta.duration);
        if (meta.distance) activity.distance = `${meta.distance}km`;
      }

      delete activity._pendingWalkingFilter;
      delete activity._needsMeta;
      filteredActivities.push(activity);
    }

    const dayResult = { date: dayData.date, activities: filteredActivities, bodyStatsLogged: dayData.bodyStatsLogged };
    if (weightMap[dayData.date] != null) dayResult.weight = weightMap[dayData.date];
    const nutr = nutritionMap[dayData.date];
    if (nutr && nutr.calories > 0) {
      dayResult.calories = nutr.calories;
      if (nutr.protein > 0) dayResult.protein = nutr.protein;
      if (nutr.insufficientTracking) dayResult.insufficientTracking = true;
    }
    if (sleepMap[dayData.date] != null) dayResult.sleep = sleepMap[dayData.date];
    days.push(dayResult);
  }

  return days;
}

// ---------------------------------------------------------------------------
// SPLIT ENDPOINTS - each fetches only the data it needs
// ---------------------------------------------------------------------------

// Helper: get client + trainerize_id (shared by all split endpoints)
async function getClient(id) {
  const result = await pool.query(
    `SELECT id, name, trainerize_id, current_phase FROM clients WHERE id = $1 AND coach_id = $2`,
    [id, COACH_ID]
  );
  return result.rows[0] || null;
}

// GET /:id/summary - checkins, scores, focus, settings (static per client, no params)
router.get('/:id/summary', async (req, res) => {
  const { id } = req.params;
  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;

    const prevWeek = getPreviousFullWeek();
    const currentMonday = getCurrentWeekMonday();

    const [trendResult, focusResult, settingsResult, trajectoryResult, calendarDataForTraining, nutritionData] = await Promise.all([
      pool.query(
        `SELECT id, form_data, cycle_start, submitted_at, responded, responded_at FROM checkins
         WHERE client_id = $1 AND coach_id = $2 AND type = 'weekly' AND form_data IS NOT NULL
         ORDER BY submitted_at DESC LIMIT 8`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT week_start::text AS week_start, focus_text FROM weekly_focus
         WHERE client_id = $1 AND coach_id = $2
         ORDER BY week_start DESC LIMIT 10`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT * FROM client_settings WHERE client_id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT * FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
      tid ? store.getCalendarData(id, tid, prevWeek.start, prevWeek.end) : null,
      tid ? store.getNutritionData(id, tid, prevWeek.start, prevWeek.end) : null,
    ]);

    const checkins = trendResult.rows.map(row => {
      const s = parseScores(row.form_data);
      const fa = parseFormAnswers(row.form_data);
      return { id: row.id, cycleStart: row.cycle_start, submittedAt: row.submitted_at, responded: row.responded, respondedAt: row.responded_at, scores: s, formAnswers: fa };
    });

    const scoreTrend = trendResult.rows
      .map(row => { const s = parseScores(row.form_data); return s ? { weekStart: row.cycle_start, ...s } : null; })
      .filter(Boolean)
      .reverse();

    const settings = settingsResult.rows[0] || null;
    const focusRows = focusResult.rows;
    const currentFocus = focusRows.find(r => r.week_start === currentMonday);
    const previousFocus = focusRows.find(r => r.week_start === prevWeek.start);

    const trainingData = parseTrainingData(calendarDataForTraining);
    const nutritionDays = parseNutritionData(nutritionData);

    const allFocus = {};
    for (const row of focusRows) allFocus[row.week_start] = row.focus_text;

    let trajectoryOverlay = null;
    const trajRow = trajectoryResult.rows[0];
    if (trajRow) {
      const fmtDate = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
      trajectoryOverlay = {
        phaseType: trajRow.phase_type, startDate: fmtDate(trajRow.start_date),
        endDate: trajRow.end_date ? fmtDate(trajRow.end_date) : null,
        minRate: trajRow.min_rate != null ? Number(trajRow.min_rate) : null,
        maxRate: trajRow.max_rate != null ? Number(trajRow.max_rate) : null,
        lowerBand: trajRow.lower_band != null ? Number(trajRow.lower_band) : null,
        upperBand: trajRow.upper_band != null ? Number(trajRow.upper_band) : null,
      };
    }

    res.json({ checkins, scoreTrend, allFocus, focus: { current: { text: currentFocus?.focus_text || '', weekStart: currentMonday }, previous: { text: previousFocus?.focus_text || '', weekStart: prevWeek.start } }, training: trainingData, nutrition: nutritionDays, trajectoryOverlay, prevWeek });
  } catch (err) {
    console.error('[ClientOverview/summary] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /:id/calendar?month=YYYY-MM - calendar days for one month
router.get('/:id/calendar', async (req, res) => {
  const { id } = req.params;
  const { month } = req.query;
  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;
    const monthRange = getMonthRange(month);
    const days = tid ? await buildCalendarDays(id, tid, monthRange) : [];
    res.json({ days });
  } catch (err) {
    console.error('[ClientOverview/calendar] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// GET /:id/compliance?range=30 - training compliance only
router.get('/:id/compliance', async (req, res) => {
  const { id } = req.params;
  const range = parseInt(req.query.range, 10) || 30;
  try {
    const data = await buildTrainingCompliance(id, range);
    res.json(data);
  } catch (err) {
    console.error('[ClientOverview/compliance] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch compliance' });
  }
});

// GET /:id/weight?range=3m - weight entries + trajectory overlay
router.get('/:id/weight', async (req, res) => {
  const { id } = req.params;
  const { range = '3m' } = req.query;
  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;
    const weightDates = getWeightRange(range);
    const prevWeek = getPreviousFullWeek();

    const [weightEntries, settingsResult, trajectoryResult] = await Promise.all([
      store.getBodyStats(id, tid, weightDates.start, weightDates.end),
      pool.query(`SELECT * FROM client_settings WHERE client_id = $1 AND coach_id = $2`, [id, COACH_ID]),
      pool.query(`SELECT * FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`, [id, COACH_ID]),
    ]);

    const settings = settingsResult.rows[0] || null;
    const weightComparison = buildWeightComparison3Weeks(weightEntries, prevWeek);

    let phaseOverlay = null;
    if (client.current_phase && settings?.phase_rate_min != null && settings?.phase_rate_max != null) {
      phaseOverlay = {
        type: client.current_phase,
        rateMin: Number(settings.phase_rate_min), rateMax: Number(settings.phase_rate_max),
        startDate: settings.phase_start_date ? (settings.phase_start_date instanceof Date ? settings.phase_start_date.toISOString().split('T')[0] : settings.phase_start_date) : null,
        startWeight: settings.phase_start_weight ? Number(settings.phase_start_weight) : null,
      };
    }

    let trajectoryOverlay = null;
    const trajRow = trajectoryResult.rows[0];
    if (trajRow) {
      const fmtDate = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
      trajectoryOverlay = {
        phaseType: trajRow.phase_type, startDate: fmtDate(trajRow.start_date),
        endDate: trajRow.end_date ? fmtDate(trajRow.end_date) : null,
        minRate: trajRow.min_rate != null ? Number(trajRow.min_rate) : null,
        maxRate: trajRow.max_rate != null ? Number(trajRow.max_rate) : null,
        lowerBand: trajRow.lower_band != null ? Number(trajRow.lower_band) : null,
        upperBand: trajRow.upper_band != null ? Number(trajRow.upper_band) : null,
      };
    }

    res.json({ entries: weightEntries, phase: phaseOverlay, trajectory: trajectoryOverlay, weightComparison });
  } catch (err) {
    console.error('[ClientOverview/weight] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch weight data' });
  }
});

// GET /:id/health - sleep, steps, resting HR (last 10 days)
router.get('/:id/health', async (req, res) => {
  const { id } = req.params;
  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;
    const last10 = getLast10Days();
    const last10Dates = dateRange(last10.start, last10.end);

    const [settingsResult, stepsRaw, sleepRaw, rhrRaw] = await Promise.all([
      pool.query(`SELECT step_target FROM client_settings WHERE client_id = $1 AND coach_id = $2`, [id, COACH_ID]),
      tid ? store.getHealthData(id, tid, 'step', last10.start, last10.end) : null,
      tid ? store.getSleepData(id, tid, last10.start, last10.end) : null,
      tid ? store.getHealthData(id, tid, 'restingHeartRate', last10.start, last10.end) : null,
    ]);

    const sleepData = parseSleepData(sleepRaw, last10Dates);
    const stepsData = parseStepsData(stepsRaw, last10Dates);
    const restingHR = parseRestingHR(rhrRaw);
    const stepTarget = settingsResult.rows[0]?.step_target || 10000;
    const stepsAvg = stepsData.length > 0 ? Math.round(stepsData.reduce((s, d) => s + d.count, 0) / stepsData.length) : null;

    res.json({ sleep: sleepData, steps: { data: stepsData, target: stepTarget, average: stepsAvg }, restingHR });
  } catch (err) {
    console.error('[ClientOverview/health] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Combined overview + calendar data (LEGACY - kept for backwards compat)
// ---------------------------------------------------------------------------

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { weightRange = '3m', calendarMonth, complianceRange = '30' } = req.query;
  const complianceDays = parseInt(complianceRange, 10) || 30;

  _timedOutSections = [];
  try {
    const clientResult = await pool.query(
      `SELECT id, name, trainerize_id, current_phase FROM clients WHERE id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    const client = clientResult.rows[0];
    const tid = client.trainerize_id;

    const prevWeek = getPreviousFullWeek();
    const last10 = getLast10Days();
    const weightDates = getWeightRange(weightRange);
    const currentMonday = getCurrentWeekMonday();
    const monthRange = getMonthRange(calendarMonth);

    // Parallel fetch: DB queries + Trainerize data + calendar data
    const [
      checkinResult,
      trendResult,
      focusResult,
      settingsResult,
      trajectoryResult,
      calendarDataForTraining,
      nutritionData,
      weightEntries,
      stepsRaw,
      sleepRaw,
      rhrRaw,
      calendarDays,
      trainingCompliance,
    ] = await Promise.all([
      // Check-in data
      pool.query(
        `SELECT form_data FROM checkins
         WHERE client_id = $1 AND coach_id = $2 AND type = 'weekly'
         ORDER BY submitted_at DESC LIMIT 1`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT id, form_data, cycle_start, submitted_at, responded, responded_at FROM checkins
         WHERE client_id = $1 AND coach_id = $2 AND type = 'weekly' AND form_data IS NOT NULL
         ORDER BY submitted_at DESC LIMIT 8`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT week_start::text AS week_start, focus_text FROM weekly_focus
         WHERE client_id = $1 AND coach_id = $2
         ORDER BY week_start DESC LIMIT 10`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT * FROM client_settings WHERE client_id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT * FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
      // Trainerize data
      tid ? store.getCalendarData(id, tid, prevWeek.start, prevWeek.end) : null,
      tid ? store.getNutritionData(id, tid, prevWeek.start, prevWeek.end) : null,
      store.getBodyStats(id, tid, weightDates.start, weightDates.end),
      tid ? store.getHealthData(id, tid, 'step', last10.start, last10.end) : null,
      tid ? store.getSleepData(id, tid, last10.start, last10.end) : null,
      tid ? store.getHealthData(id, tid, 'restingHeartRate', last10.start, last10.end) : null,
      // Calendar days for the specified month
      tid ? buildCalendarDays(id, tid, monthRange) : [],
      // Step 4: Training compliance for the specified range
      buildTrainingCompliance(id, complianceDays),
    ]);

    // Parse check-in scores
    const last10Dates = dateRange(last10.start, last10.end);
    const sleepData = parseSleepData(sleepRaw, last10Dates);
    const stepsData = parseStepsData(stepsRaw, last10Dates);
    const restingHR = parseRestingHR(rhrRaw);
    const trainingData = parseTrainingData(calendarDataForTraining);
    const nutritionDays = parseNutritionData(nutritionData);

    // Step 5: 3-week weight comparison
    const weightComparison = buildWeightComparison3Weeks(weightEntries, prevWeek);

    // Build checkins array (index 0 = most recent, all have scores + formAnswers)
    const checkins = trendResult.rows.map(row => {
      const s = parseScores(row.form_data);
      const fa = parseFormAnswers(row.form_data);
      return {
        id: row.id,
        cycleStart: row.cycle_start,
        submittedAt: row.submitted_at,
        responded: row.responded,
        respondedAt: row.responded_at,
        scores: s,
        formAnswers: fa,
      };
    });

    // Score trend (oldest first for charting)
    const scoreTrend = trendResult.rows
      .map(row => {
        const s = parseScores(row.form_data);
        return s ? { weekStart: row.cycle_start, ...s } : null;
      })
      .filter(Boolean)
      .reverse();

    const settings = settingsResult.rows[0] || null;

    const focusRows = focusResult.rows;
    const currentFocus = focusRows.find(r => r.week_start === currentMonday);
    const previousFocus = focusRows.find(r => r.week_start === prevWeek.start);

    const stepTarget = settings?.step_target || 10000;
    const stepsAvg = stepsData.length > 0
      ? Math.round(stepsData.reduce((s, d) => s + d.count, 0) / stepsData.length)
      : null;

    let phaseOverlay = null;
    if (client.current_phase && settings?.phase_rate_min != null && settings?.phase_rate_max != null) {
      phaseOverlay = {
        type: client.current_phase,
        rateMin: Number(settings.phase_rate_min),
        rateMax: Number(settings.phase_rate_max),
        startDate: settings.phase_start_date
          ? (settings.phase_start_date instanceof Date ? settings.phase_start_date.toISOString().split('T')[0] : settings.phase_start_date)
          : null,
        startWeight: settings.phase_start_weight ? Number(settings.phase_start_weight) : null,
      };
    }

    let trajectoryOverlay = null;
    const trajRow = trajectoryResult.rows[0];
    if (trajRow) {
      const fmtDate = (d) => d instanceof Date ? d.toISOString().split('T')[0] : d;
      trajectoryOverlay = {
        phaseType: trajRow.phase_type,
        startDate: fmtDate(trajRow.start_date),
        endDate: trajRow.end_date ? fmtDate(trajRow.end_date) : null,
        minRate: trajRow.min_rate != null ? Number(trajRow.min_rate) : null,
        maxRate: trajRow.max_rate != null ? Number(trajRow.max_rate) : null,
        lowerBand: trajRow.lower_band != null ? Number(trajRow.lower_band) : null,
        upperBand: trajRow.upper_band != null ? Number(trajRow.upper_band) : null,
      };
    }

    const allFocus = {};
    for (const row of focusRows) allFocus[row.week_start] = row.focus_text;

    // Map timed-out endpoints to human-readable section names
    const SECTION_MAP = {
      '/calendar/getList': 'training',
      '/dailyNutrition/getList': 'nutrition',
      '/bodystats/get': 'weight',
      '/healthData/getList': 'steps',
      '/healthData/getListSleep': 'sleep',
    };
    const timedOutSections = [...new Set(
      _timedOutSections.map(ep => SECTION_MAP[ep] || ep)
    )];

    res.json({
      checkins,
      scoreTrend,
      allFocus,
      focus: {
        current: { text: currentFocus?.focus_text || '', weekStart: currentMonday },
        previous: { text: previousFocus?.focus_text || '', weekStart: prevWeek.start },
      },
      sleep: sleepData,
      steps: { data: stepsData, target: stepTarget, average: stepsAvg },
      restingHR,
      training: trainingData,
      trainingCompliance,
      nutrition: nutritionDays,
      weight: { entries: weightEntries, phase: phaseOverlay, trajectory: trajectoryOverlay },
      weightComparison,
      calendar: { days: calendarDays },
      prevWeek,
      ...(timedOutSections.length > 0 ? { timedOutSections } : {}),
    });
  } catch (err) {
    console.error('[ClientOverview] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch client overview' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/workout/:workoutId - Workout detail for calendar expansion
// ---------------------------------------------------------------------------

router.get('/:id/workout/:workoutId', async (req, res) => {
  const { id, workoutId } = req.params;

  try {
    const result = await pool.query(
      `SELECT detail_json FROM client_workouts
       WHERE client_id = $1 AND coach_id = $2 AND trainerize_id = $3`,
      [id, COACH_ID, workoutId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    const detail = result.rows[0].detail_json;
    if (!detail) {
      return res.json({ exercises: [] });
    }

    // Parse exercise data from the detail_json
    const exercises = (detail.exercises || []).map(ex => ({
      name: ex.name || ex.exerciseName || 'Unknown',
      sets: (ex.stats || []).map(s => ({
        reps: s.reps != null ? s.reps : null,
        weight: s.weight != null ? s.weight : null,
      })),
    }));

    res.json({ exercises });
  } catch (err) {
    console.error('[ClientOverview] Workout detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch workout detail' });
  }
});

module.exports = router;
