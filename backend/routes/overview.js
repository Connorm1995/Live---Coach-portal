const express = require('express');
const pool = require('../db/pool');
const { trainerizePost: tzPost, trainerizeGet: tzGet } = require('../lib/trainerize');
const store = require('../lib/trainerize-store');

const router = express.Router();
const COACH_ID = 1;

// Thin wrappers - return raw data, track timeouts per request
// Single-coach tool so module-level array is safe (no concurrent users)
let _timedOutSections = [];
async function trainerizePost(endpoint, body) {
  const result = await tzPost(endpoint, body, { label: 'Overview' });
  if (result.timedOut) _timedOutSections.push(endpoint);
  return result.data;
}
async function trainerizeGet(endpoint) {
  const result = await tzGet(endpoint, { label: 'Overview' });
  if (result.timedOut) _timedOutSections.push(endpoint);
  return result.data;
}

// --- Date helpers ---

function getPreviousFullWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay(); // 0=Sun
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

// --- Score parsing from Typeform form_data ---

// Weighted score bracket tables (raw 1-10 -> weighted 1-5)
const WEIGHT_BRACKETS = {
  overall:   [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  training:  [1, 1, 2, 2, 2, 3, 3, 4, 5, 5],
  steps:     [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition: [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep:     [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion: [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress:    [5, 5, 5, 5, 4, 3, 3, 2, 2, 2], // INVERTED
};

const DAYS_ON_PLAN_WEIGHTS = { '0-1 days': 1, '2-3 days': 2, '4-5 days': 4, '6-7 days': 5 };
const PROGRESS_WEIGHTS = { 'Progressed': 5, 'Stayed the same': 3, 'Regressed': 1 };

const SCORE_CATEGORIES = ['overall', 'training', 'steps', 'nutrition', 'sleep', 'digestion', 'stress'];

const SCORE_KEYWORDS = {
  overall: ['overall performance', 'overall'],
  training: ['training', 'workout', 'exercise', 'gym'],
  nutrition: ['nutrition', 'diet', 'eating', 'food', 'meals'],
  steps: ['step', 'steps', 'step count', 'walking', 'movement'],
  sleep: ['sleep', 'rest', 'hours in bed'],
  digestion: ['digestion', 'gut', 'digestive', 'stomach', 'bloating'],
  stress: ['stress', 'anxiety', 'mental health', 'mood'],
};

const TEXT_KEYWORDS = {
  wins: ['wins', 'biggest win', 'proud', 'achievement', 'highlight'],
  stressSource: ['stress source', 'source of stress', 'stressor', 'what caused stress', 'causing you stress'],
  helpNeeded: ['help', 'support', 'need help', 'assistance', 'struggle'],
  upcomingEvents: ['upcoming', 'events', 'plans', 'next week', 'coming up'],
};

function matchCategory(fieldTitle, keywordMap) {
  if (!fieldTitle) return null;
  const lower = fieldTitle.toLowerCase();
  for (const [cat, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

function toWeighted(category, rawValue) {
  const bracket = WEIGHT_BRACKETS[category];
  if (!bracket || rawValue < 1 || rawValue > 10) return null;
  return bracket[rawValue - 1];
}

function parseScores(formData) {
  if (!formData || !Array.isArray(formData)) return null;

  const raw = {};
  const weighted = {};
  let daysOnPlan = null;
  let daysOnPlanWeighted = null;
  let progressDirection = null;
  let progressWeighted = null;

  for (const answer of formData) {
    const ft = answer.field?.type;
    const title = answer.field?.title || answer.field?.ref || '';

    // Scale questions (opinion_scale 1-10)
    if (ft === 'opinion_scale' || ft === 'rating' || answer.type === 'number') {
      const cat = matchCategory(title, SCORE_KEYWORDS);
      if (cat && answer.number != null) {
        raw[cat] = answer.number;
        weighted[cat] = toWeighted(cat, answer.number);
      }
    }

    // Choice questions (days on plan, progress direction)
    if (answer.type === 'choice' && answer.choice?.label) {
      const label = answer.choice.label;
      if (title.toLowerCase().includes('on plan') || title.toLowerCase().includes('days')) {
        daysOnPlan = label;
        daysOnPlanWeighted = DAYS_ON_PLAN_WEIGHTS[label] || null;
      } else if (title.toLowerCase().includes('progress') || title.toLowerCase().includes('regress')) {
        progressDirection = label;
        progressWeighted = PROGRESS_WEIGHTS[label] || null;
      }
    }
  }

  if (Object.keys(raw).length === 0) return null;

  // Calculate total weighted score out of 45
  let totalWeighted = 0;
  let countScored = 0;
  for (const cat of SCORE_CATEGORIES) {
    if (weighted[cat] != null) {
      totalWeighted += weighted[cat];
      countScored++;
    }
  }
  if (daysOnPlanWeighted != null) { totalWeighted += daysOnPlanWeighted; countScored++; }
  if (progressWeighted != null) { totalWeighted += progressWeighted; countScored++; }

  // Need at least 5 scored fields for a valid total
  const totalValid = countScored >= 5;

  return {
    raw,
    weighted,
    daysOnPlan,
    daysOnPlanWeighted,
    progressDirection,
    progressWeighted,
    totalWeighted: totalValid ? totalWeighted : null,
    maxTotal: 45,
    // Legacy compat: keep individual category values at top level for trend access
    ...raw,
  };
}

function parseFormAnswers(formData) {
  if (!formData || !Array.isArray(formData)) return null;

  const answers = {};
  for (const answer of formData) {
    if (answer.type === 'text' && (answer.field?.type === 'long_text' || answer.field?.type === 'short_text')) {
      const title = answer.field?.title || answer.field?.ref || '';
      // Skip the name field (first short_text)
      if (answer.field?.type === 'short_text') continue;
      const cat = matchCategory(title, TEXT_KEYWORDS);
      if (cat) answers[cat] = answer.text;
    }
  }

  return Object.keys(answers).length > 0 ? answers : null;
}

// --- Trainerize data parsers ---

// Parse steps from healthData/getList response, filling missing days with 0
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

// Parse resting heart rate from healthData/getList response
function parseRestingHR(response) {
  if (!response?.healthData) return [];
  return response.healthData
    .filter(e => e.type === 'restingHeartRate' && e.data?.restingHeartRate != null)
    .map(e => ({ date: e.date, bpm: e.data.restingHeartRate }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Parse sleep from healthData/getListSleep response, filling missing days with 0
// Sleep comes as many small "asleep" segments - aggregate into nightly totals
function parseSleepData(response, dateRangeArr) {
  const TZ = 'Europe/Dublin';

  // Convert a UTC Date object to a local time string "HH:MM" in Europe/Dublin
  function toLocalTimeStr(date) {
    return new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  // Convert a UTC Date object to a local date string "YYYY-MM-DD" in Europe/Dublin
  function toLocalDateStr(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const p = {};
    for (const { type, value } of parts) p[type] = value;
    return `${p.year}-${p.month}-${p.day}`;
  }

  // Get the local hour (0-23) in Europe/Dublin for a UTC Date
  function toLocalHour(date) {
    const parts = new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    return parseInt(hourPart.value, 10);
  }

  // Group segments by "sleep night" (a night = segments from noon to noon next day, in Dublin time)
  const nights = {};
  if (response?.sleep && Array.isArray(response.sleep)) {
    for (const seg of response.sleep) {
      if (seg.type !== 'asleep') continue;
      const start = new Date(seg.startTime.replace(' ', 'T') + 'Z');
      const end = new Date(seg.endTime.replace(' ', 'T') + 'Z');
      const durationMin = (end - start) / 60000;
      if (durationMin <= 0) continue;

      // Assign to a "night date" using Dublin local time:
      // if the local hour is before noon, the segment belongs to the previous calendar date
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
      if (start < nights[nightDate].earliestStart) {
        nights[nightDate].earliestStart = start;
      }
      if (end > nights[nightDate].latestEnd) {
        nights[nightDate].latestEnd = end;
      }
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

// Generate all dates between start and end (inclusive)
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

// Fetch weight entries by iterating through dates in the range
async function fetchWeightEntries(tid, startDate, endDate) {
  if (!tid) return [];

  // First check if user has any bodystat data at all via "last" entry
  const lastEntry = await trainerizePost('/bodystats/get', {
    userID: Number(tid),
    date: 'last',
    unitWeight: 'kg',
    unitBodystats: 'cm',
  });

  if (!lastEntry || lastEntry.code !== 200 || !lastEntry.bodyMeasures?.bodyWeight) return [];

  // If the last entry is older than our start date, no point iterating
  if (lastEntry.date < startDate) return [];

  const dates = dateRange(startDate, endDate);
  const entries = [];

  // Fetch in parallel batches of 10
  for (let i = 0; i < dates.length; i += 10) {
    const batch = dates.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(date =>
        trainerizePost('/bodystats/get', {
          userID: Number(tid),
          date,
          unitWeight: 'kg',
          unitBodystats: 'cm',
        })
      )
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value?.bodyMeasures?.bodyWeight != null && result.value.code === 200) {
        entries.push({
          date: result.value.bodyMeasures.date || result.value.date || batch[j],
          weight: result.value.bodyMeasures.bodyWeight,
        });
      }
    }
  }

  return entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function parseTrainingData(response) {
  const empty = { weightSessions: { completed: 0, programmed: 0 }, cardioSessions: 0 };
  if (!response) return empty;

  const calendar = response.calendar || [];
  if (!Array.isArray(calendar)) return empty;

  // calendar structure: [{ date, items: [{ type, status, ... }] }]
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

function buildWeightComparison(weightEntries, prevWeek) {
  const prevPrevWeek = getWeekBefore(prevWeek.start);

  const last = weightEntries.filter(e => e.date >= prevWeek.start && e.date <= prevWeek.end);
  const prev = weightEntries.filter(e => e.date >= prevPrevWeek.start && e.date <= prevPrevWeek.end);

  const avg = (arr) => arr.length > 0
    ? Number((arr.reduce((s, e) => s + e.weight, 0) / arr.length).toFixed(1))
    : null;

  const lastAvg = avg(last);
  const prevAvg = avg(prev);

  return {
    lastWeek: { average: lastAvg, count: last.length, dates: last.map(e => e.date), label: `${prevWeek.start} - ${prevWeek.end}` },
    previousWeek: { average: prevAvg, count: prev.length, dates: prev.map(e => e.date), label: `${prevPrevWeek.start} - ${prevPrevWeek.end}` },
    delta: lastAvg != null && prevAvg != null ? Number((lastAvg - prevAvg).toFixed(1)) : null,
  };
}

// === ROUTES ===

// GET /api/overview/:id - Main overview data
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { weightRange = '3m' } = req.query;

  _timedOutSections = []; // reset per request
  try {
    const clientResult = await pool.query(
      `SELECT id, name, trainerize_id, current_phase FROM clients WHERE id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    const client = clientResult.rows[0];

    const prevWeek = getPreviousFullWeek();
    const last10 = getLast10Days();
    const weightDates = getWeightRange(weightRange);
    const currentMonday = getCurrentWeekMonday();

    // Parallel fetch: DB + Trainerize
    const tid = client.trainerize_id;
    const [
      checkinResult,
      trendResult,
      focusResult,
      settingsResult,
      trajectoryResult,
      calendarData,
      nutritionData,
      weightEntries,
      stepsRaw,
      sleepRaw,
      rhrRaw,
    ] = await Promise.all([
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
         ORDER BY week_start DESC
         LIMIT 10`,
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
      // calendar/getList for training compliance (workouts + cardio in prev week)
      tid ? store.getCalendarData(id, tid, prevWeek.start, prevWeek.end) : null,
      // dailyNutrition/getList for nutrition adherence
      tid ? store.getNutritionData(id, tid, prevWeek.start, prevWeek.end) : null,
      // bodystats for weight trajectory (DB-backed)
      store.getBodyStats(id, tid, weightDates.start, weightDates.end),
      // healthData for steps (last 10 days, DB-backed)
      tid ? store.getHealthData(id, tid, 'step', last10.start, last10.end) : null,
      // sleep data (last 10 days, DB-backed)
      tid ? store.getSleepData(id, tid, last10.start, last10.end) : null,
      // resting heart rate (last 10 days, DB-backed)
      tid ? store.getHealthData(id, tid, 'restingHeartRate', last10.start, last10.end) : null,
    ]);

    // Parse
    const formData = checkinResult.rows[0]?.form_data || null;
    const scores = parseScores(formData);
    const formAnswers = parseFormAnswers(formData);

    const scoreTrend = trendResult.rows
      .map(row => {
        const s = parseScores(row.form_data);
        return s ? { weekStart: row.cycle_start, ...s } : null;
      })
      .filter(Boolean)
      .reverse();

    // Build previous check-ins list (skip most recent, include up to 7 prior)
    const previousCheckins = trendResult.rows.slice(1).map(row => {
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

    const settings = settingsResult.rows[0] || null;

    const focusRows = focusResult.rows;
    const currentFocus = focusRows.find(r => r.week_start === currentMonday);
    const previousFocus = focusRows.find(r => r.week_start === prevWeek.start);

    const last10Dates = dateRange(last10.start, last10.end);
    const sleepData = parseSleepData(sleepRaw, last10Dates);
    const stepsData = parseStepsData(stepsRaw, last10Dates);
    const restingHR = parseRestingHR(rhrRaw);
    const trainingData = parseTrainingData(calendarData);
    const nutritionDays = parseNutritionData(nutritionData);
    const weightComparison = buildWeightComparison(weightEntries, prevWeek);

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

    // Build trajectory overlay from new independent table
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

    // Build focus lookup for previous check-ins
    const allFocus = {};
    for (const row of focusRows) {
      allFocus[row.week_start] = row.focus_text;
    }

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
      scores,
      scoreTrend,
      formAnswers,
      previousCheckins,
      allFocus,
      focus: {
        current: { text: currentFocus?.focus_text || '', weekStart: currentMonday },
        previous: { text: previousFocus?.focus_text || '', weekStart: prevWeek.start },
      },
      sleep: sleepData,
      steps: { data: stepsData, target: stepTarget, average: stepsAvg },
      restingHR,
      training: trainingData,
      nutrition: nutritionDays,
      weight: { entries: weightEntries, phase: phaseOverlay, trajectory: trajectoryOverlay },
      weightComparison,
      prevWeek,
      ...(timedOutSections.length > 0 ? { timedOutSections } : {}),
    });
  } catch (err) {
    console.error('[Overview] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// PUT /api/overview/:id/focus - Save/update focus
router.put('/:id/focus', async (req, res) => {
  const { id } = req.params;
  const { text, weekStart } = req.body;

  if (text == null || !weekStart) {
    return res.status(400).json({ error: 'text and weekStart are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO weekly_focus (coach_id, client_id, week_start, focus_text, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (coach_id, client_id, week_start)
       DO UPDATE SET focus_text = $4, updated_at = now()
       RETURNING id, week_start, focus_text`,
      [COACH_ID, id, weekStart, text]
    );
    res.json({ focus: result.rows[0] });
  } catch (err) {
    console.error('[Focus] Error:', err.message);
    res.status(500).json({ error: 'Failed to save focus' });
  }
});

// PUT /api/overview/:id/settings - Update client settings
router.put('/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { stepTarget, phaseRateMin, phaseRateMax, phaseStartDate, phaseStartWeight, fibreTarget } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO client_settings (coach_id, client_id, step_target, phase_rate_min, phase_rate_max, phase_start_date, phase_start_weight, fibre_target, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (coach_id, client_id)
       DO UPDATE SET
         step_target = COALESCE($3, client_settings.step_target),
         phase_rate_min = COALESCE($4, client_settings.phase_rate_min),
         phase_rate_max = COALESCE($5, client_settings.phase_rate_max),
         phase_start_date = COALESCE($6, client_settings.phase_start_date),
         phase_start_weight = COALESCE($7, client_settings.phase_start_weight),
         fibre_target = COALESCE($8, client_settings.fibre_target),
         updated_at = now()
       RETURNING *`,
      [COACH_ID, id, stepTarget, phaseRateMin, phaseRateMax, phaseStartDate, phaseStartWeight, fibreTarget]
    );
    res.json({ settings: result.rows[0] });
  } catch (err) {
    console.error('[Settings] Error:', err.message);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// GET /api/overview/:id/trajectory-settings
router.get('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    const row = result.rows[0];
    if (!row) return res.json({ trajectorySettings: null });

    res.json({
      trajectorySettings: {
        phaseType: row.phase_type,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : row.start_date,
        endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : row.end_date) : null,
        minRate: row.min_rate != null ? Number(row.min_rate) : null,
        maxRate: row.max_rate != null ? Number(row.max_rate) : null,
        lowerBand: row.lower_band != null ? Number(row.lower_band) : null,
        upperBand: row.upper_band != null ? Number(row.upper_band) : null,
      },
    });
  } catch (err) {
    console.error('[TrajectorySettings] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trajectory settings' });
  }
});

// PUT /api/overview/:id/trajectory-settings
router.put('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  const { phaseType, startDate, endDate, minRate, maxRate, lowerBand, upperBand } = req.body;

  const validPhases = ['fat_loss', 'building', 'recomp', 'maintenance'];
  if (!validPhases.includes(phaseType)) {
    return res.status(400).json({ error: 'Invalid phase type' });
  }
  if (!startDate) {
    return res.status(400).json({ error: 'Start date is required' });
  }

  const isRate = phaseType === 'fat_loss' || phaseType === 'building';
  const finalMinRate = isRate ? minRate : null;
  const finalMaxRate = isRate ? maxRate : null;
  const finalLowerBand = isRate ? null : lowerBand;
  const finalUpperBand = isRate ? null : upperBand;

  try {
    const result = await pool.query(
      `INSERT INTO weight_trajectory_settings (coach_id, client_id, phase_type, start_date, end_date, min_rate, max_rate, lower_band, upper_band, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (coach_id, client_id)
       DO UPDATE SET
         phase_type = $3,
         start_date = $4,
         end_date = $5,
         min_rate = $6,
         max_rate = $7,
         lower_band = $8,
         upper_band = $9,
         updated_at = now()
       RETURNING *`,
      [COACH_ID, id, phaseType, startDate, endDate || null, finalMinRate, finalMaxRate, finalLowerBand, finalUpperBand]
    );
    const row = result.rows[0];
    res.json({
      trajectorySettings: {
        phaseType: row.phase_type,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : row.start_date,
        endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : row.end_date) : null,
        minRate: row.min_rate != null ? Number(row.min_rate) : null,
        maxRate: row.max_rate != null ? Number(row.max_rate) : null,
        lowerBand: row.lower_band != null ? Number(row.lower_band) : null,
        upperBand: row.upper_band != null ? Number(row.upper_band) : null,
      },
    });
  } catch (err) {
    console.error('[TrajectorySettings] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to save trajectory settings' });
  }
});

// DELETE /api/overview/:id/trajectory-settings
router.delete('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `DELETE FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[TrajectorySettings] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to clear trajectory settings' });
  }
});

module.exports = router;
