const express = require('express');
const pool = require('../db/pool');

const router = express.Router();
const COACH_ID = 1;

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

async function trainerizePost(endpoint, body) {
  try {
    const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: TRAINERIZE_AUTH,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[Training] Trainerize ${endpoint} returned ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[Training] Trainerize ${endpoint} error:`, err.message);
    return null;
  }
}

// --- Date helpers ---

// Last 2 full weeks (Mon-Sun) + current week to today
function getCalendarRange() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  const twoWeeksAgoMonday = new Date(thisMonday);
  twoWeeksAgoMonday.setUTCDate(thisMonday.getUTCDate() - 14);
  return {
    start: twoWeeksAgoMonday.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
    todayStr: today.toISOString().split('T')[0],
    thisMonday: thisMonday.toISOString().split('T')[0],
  };
}

const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];

// Walking/hiking names to check for filtering
const WALKING_NAMES = ['walking', 'walk', 'hiking', 'hike'];

function isWalkingSession(name) {
  return WALKING_NAMES.some(w => name.toLowerCase().includes(w));
}

// Check if a walking session meets at least one threshold:
// distance > 3km, duration > 45min (2700s), or maxHeartRate > 100bpm
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

// --- Helper: get client with trainerize_id ---
async function getClient(id) {
  const result = await pool.query(
    `SELECT id, name, trainerize_id FROM clients WHERE id = $1 AND coach_id = $2`,
    [id, COACH_ID]
  );
  return result.rows[0] || null;
}

// --- Helper: get completed workout IDs from calendar over a date range ---
async function getCompletedWorkoutIds(tid, startDate, endDate) {
  const calendarData = await trainerizePost('/calendar/getList', {
    userID: Number(tid),
    startDate,
    endDate,
    unitWeight: 'kg',
  });
  if (!calendarData?.calendar) return [];

  const ids = [];
  for (const day of calendarData.calendar) {
    for (const item of (day.items || [])) {
      if (WORKOUT_TYPES.includes(item.type) && (item.status === 'tracked' || item.status === 'checkedIn')) {
        ids.push(item.id);
      }
    }
  }
  return ids;
}

// --- Helper: fetch workout details in batches ---
async function fetchWorkoutDetails(workoutIds) {
  if (workoutIds.length === 0) return [];

  const allWorkouts = [];
  for (let i = 0; i < workoutIds.length; i += 20) {
    const batch = workoutIds.slice(i, i + 20);
    const data = await trainerizePost('/dailyWorkout/get', { ids: batch });
    if (data?.dailyWorkouts) {
      allWorkouts.push(...data.dailyWorkouts);
    }
  }
  return allWorkouts;
}

// Exercise type classification
const TIMED_RECORD_TYPES = ['timedLongerBetter', 'timedStrength', 'timedFasterBetter'];

function classifyExercise(exerciseDef, stats) {
  const rt = exerciseDef?.recordType || '';
  // Time-based: recordType is timed, or stats only have time data
  if (TIMED_RECORD_TYPES.includes(rt)) return 'time';
  // Check if stats have time but no weight/reps
  const hasTime = (stats || []).some(s => s.time != null && s.time > 0);
  const hasWeight = (stats || []).some(s => s.weight != null && s.weight > 0);
  const hasReps = (stats || []).some(s => s.reps != null && s.reps > 0);
  if (hasTime && !hasWeight && !hasReps) return 'time';
  // Weighted: has weight data
  if (hasWeight) return 'weighted';
  // Bodyweight: has reps but no weight
  if (hasReps && !hasWeight) return 'bodyweight';
  return 'unknown';
}

// --- Helper: extract unique trackable exercises from workouts ---
function extractExercises(workouts) {
  const exerciseMap = new Map();
  for (const w of workouts) {
    for (const ex of (w.exercises || [])) {
      if (!ex.def?.name) continue;
      const rt = ex.def.recordType;
      // Include strength and timed exercises
      if (rt !== 'strength' && !TIMED_RECORD_TYPES.includes(rt)) continue;
      const type = classifyExercise(ex.def, ex.stats);
      if (type === 'unknown') continue;
      if (!exerciseMap.has(ex.def.id)) {
        exerciseMap.set(ex.def.id, {
          id: ex.def.id,
          name: ex.def.name,
          type,
        });
      }
    }
  }
  return [...exerciseMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// --- Helper: find current best for a given exercise across workouts ---
function findCurrentBest(workouts, exerciseName, targetType, excludeFlags) {
  let best = null;
  let bestDate = null;

  for (const w of workouts) {
    for (const ex of (w.exercises || [])) {
      if (ex.def?.name !== exerciseName) continue;

      if (targetType === 'max_reps') {
        // Bodyweight: find highest single-set rep count with no weight
        for (const [si, set] of (ex.stats || []).entries()) {
          if (excludeFlags && excludeFlags.has(flagKey(w.id, exerciseName, si + 1))) continue;
          if (set.reps == null || set.reps <= 0) continue;
          if (set.weight != null && set.weight > 0) continue; // skip weighted sets
          if (best == null || set.reps > best) {
            best = set.reps;
            bestDate = w.date;
          }
        }
      } else if (targetType === 'max_time') {
        // Time-based: find longest hold
        for (const [si, set] of (ex.stats || []).entries()) {
          if (excludeFlags && excludeFlags.has(flagKey(w.id, exerciseName, si + 1))) continue;
          if (set.time == null || set.time <= 0) continue;
          if (best == null || set.time > best) {
            best = set.time;
            bestDate = w.date;
          }
        }
      } else {
        // Weighted: find heaviest weight at target rep range
        const targetReps = targetType === '1rm' ? 1 : targetType === '5rm' ? 5 : 10;
        for (const [si, set] of (ex.stats || []).entries()) {
          if (excludeFlags && excludeFlags.has(flagKey(w.id, exerciseName, si + 1))) continue;
          if (set.weight == null || set.weight <= 0) continue;
          if (set.reps == null || set.reps <= 0) continue;
          if (set.reps >= targetReps) {
            if (best == null || set.weight > best) {
              best = set.weight;
              bestDate = w.date;
            }
          }
        }
      }
    }
  }

  return { best, bestDate };
}

// =====================
// SESSION CALENDAR
// =====================

function parseSessionCalendar(response) {
  if (!response?.calendar || !Array.isArray(response.calendar)) return { days: [], walkingIds: [] };

  const days = [];
  const walkingIds = [];

  for (const day of response.calendar) {
    const date = day.date;
    if (!date) continue;
    const items = day.items || [];

    const sessions = [];
    for (const item of items) {
      const isWorkout = WORKOUT_TYPES.includes(item.type);
      const isCardio = item.type === 'cardio';
      if (!isWorkout && !isCardio) continue;

      const completed = item.status === 'tracked' || item.status === 'checkedIn';
      const name = item.title || 'Session';

      if (isWorkout) {
        sessions.push({
          id: item.id,
          name,
          category: 'strength',
          completed,
        });
      } else if (isCardio) {
        const isWalking = isWalkingSession(name);
        if (isWalking && completed) {
          walkingIds.push(item.id);
        }
        sessions.push({
          id: item.id,
          name,
          category: isWalking ? 'walking' : 'cardio',
          completed,
          // Walking sessions need threshold check - mark as pending filter
          _pendingWalkingFilter: isWalking && completed,
        });
      }
    }

    days.push({ date, sessions });
  }

  return { days, walkingIds };
}

// GET /api/training/:id/calendar
router.get('/:id/calendar', async (req, res) => {
  const { id } = req.params;

  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;
    if (!tid) return res.json({ calendar: [], range: getCalendarRange() });

    const range = getCalendarRange();
    const calendarData = await trainerizePost('/calendar/getList', {
      userID: Number(tid),
      startDate: range.start,
      endDate: range.end,
      unitWeight: 'kg',
    });

    const { days, walkingIds } = parseSessionCalendar(calendarData);

    // Fetch walking workout details to apply threshold filter
    let walkingDetails = {};
    if (walkingIds.length > 0) {
      const details = await fetchWorkoutDetails(walkingIds);
      for (const d of details) {
        walkingDetails[d.id] = d;
      }
    }

    // Apply walking filter
    const filteredDays = days.map(day => ({
      date: day.date,
      sessions: day.sessions.filter(s => {
        if (!s._pendingWalkingFilter) return true;
        const detail = walkingDetails[s.id];
        if (!detail) return false;
        return walkingMeetsThreshold(detail);
      }).map(s => {
        const { _pendingWalkingFilter, ...rest } = s;
        return rest;
      }),
    }));

    res.json({ calendar: filteredDays, range });
  } catch (err) {
    console.error('[Training] Calendar error:', err.message);
    res.status(500).json({ error: 'Failed to fetch training calendar' });
  }
});

// =====================
// EXERCISES LIST
// =====================

router.get('/:id/exercises', async (req, res) => {
  const { id } = req.params;

  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.trainerize_id) return res.json({ exercises: [] });

    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 3);

    const workoutIds = await getCompletedWorkoutIds(
      client.trainerize_id,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );

    const workouts = await fetchWorkoutDetails(workoutIds);
    const exercises = extractExercises(workouts);
    res.json({ exercises });
  } catch (err) {
    console.error('[Training] Exercises error:', err.message);
    res.status(500).json({ error: 'Failed to fetch exercises' });
  }
});

// =====================
// KEY LIFTS TRACKER
// =====================

router.get('/:id/key-lifts', async (req, res) => {
  const { id } = req.params;

  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const targetsResult = await pool.query(
      `SELECT id, exercise_name, exercise_id, target_type, target_weight
       FROM key_lift_targets
       WHERE client_id = $1 AND coach_id = $2
       ORDER BY created_at`,
      [id, COACH_ID]
    );

    const targets = targetsResult.rows;
    if (targets.length === 0 || !client.trainerize_id) {
      return res.json({
        lifts: targets.map(t => ({
          ...t,
          currentBest: null,
          bestDate: null,
          progress: null,
        })),
      });
    }

    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 3);

    const workoutIds = await getCompletedWorkoutIds(
      client.trainerize_id,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );

    const workouts = await fetchWorkoutDetails(workoutIds);

    // Build exercise type map for outlier detection
    const exerciseTypes = {};
    for (const w of workouts) {
      for (const ex of (w.exercises || [])) {
        if (!ex.def?.name) continue;
        if (!exerciseTypes[ex.def.name]) {
          exerciseTypes[ex.def.name] = classifyExercise(ex.def, ex.stats);
        }
      }
    }

    // Detect auto-outliers
    const autoFlags = detectAutoOutliers(workouts, exerciseTypes);

    // Query manual flags for this client
    const manualFlagRows = await pool.query(
      `SELECT workout_id, exercise_name, set_num FROM data_error_flags WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    const manualFlags = new Set(manualFlagRows.rows.map(r => flagKey(r.workout_id, r.exercise_name, r.set_num)));

    // Combine into allFlags
    const allFlags = new Set([...autoFlags, ...manualFlags]);

    const lifts = targets.map(t => {
      const { best, bestDate } = findCurrentBest(workouts, t.exercise_name, t.target_type, allFlags);
      const targetVal = Number(t.target_weight);
      const progress = best != null && targetVal > 0
        ? Math.round((best / targetVal) * 100)
        : null;

      // Format best and target display based on target type
      let bestDisplay = null;
      let targetDisplay = `${targetVal} kg`;
      let unit = 'kg';

      if (t.target_type === 'max_reps') {
        bestDisplay = best != null ? `${best} reps` : null;
        targetDisplay = `${targetVal} reps`;
        unit = 'reps';
      } else if (t.target_type === 'max_time') {
        bestDisplay = best != null ? fmtTime(best) : null;
        targetDisplay = fmtTime(targetVal);
        unit = 'sec';
      } else {
        bestDisplay = best != null ? `${best} kg` : null;
      }

      return {
        ...t,
        target_weight: targetVal,
        currentBest: best,
        bestDisplay,
        targetDisplay,
        unit,
        bestDate,
        progress,
      };
    });

    res.json({ lifts });
  } catch (err) {
    console.error('[Training] Key lifts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch key lifts' });
  }
});

router.post('/:id/key-lifts', async (req, res) => {
  const { id } = req.params;
  const { exerciseName, exerciseId, targetType, targetWeight } = req.body;

  if (!exerciseName || !targetType || !targetWeight) {
    return res.status(400).json({ error: 'exerciseName, targetType, and targetWeight are required' });
  }
  if (!['1rm', '5rm', '10rm', 'max_reps', 'max_time'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid targetType' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO key_lift_targets (coach_id, client_id, exercise_name, exercise_id, target_type, target_weight)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, exercise_name, exercise_id, target_type, target_weight`,
      [COACH_ID, id, exerciseName, exerciseId || null, targetType, targetWeight]
    );
    res.json({ lift: result.rows[0] });
  } catch (err) {
    console.error('[Training] Add key lift error:', err.message);
    res.status(500).json({ error: 'Failed to add key lift target' });
  }
});

router.put('/:id/key-lifts/:liftId', async (req, res) => {
  const { id, liftId } = req.params;
  const { targetType, targetWeight } = req.body;

  try {
    const result = await pool.query(
      `UPDATE key_lift_targets
       SET target_type = COALESCE($1, target_type),
           target_weight = COALESCE($2, target_weight),
           updated_at = now()
       WHERE id = $3 AND client_id = $4 AND coach_id = $5
       RETURNING id, exercise_name, exercise_id, target_type, target_weight`,
      [targetType, targetWeight, liftId, id, COACH_ID]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lift target not found' });
    res.json({ lift: result.rows[0] });
  } catch (err) {
    console.error('[Training] Update key lift error:', err.message);
    res.status(500).json({ error: 'Failed to update key lift target' });
  }
});

router.delete('/:id/key-lifts/:liftId', async (req, res) => {
  const { id, liftId } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM key_lift_targets WHERE id = $1 AND client_id = $2 AND coach_id = $3 RETURNING id`,
      [liftId, id, COACH_ID]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lift target not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('[Training] Delete key lift error:', err.message);
    res.status(500).json({ error: 'Failed to delete key lift target' });
  }
});

// =====================
// TRAINING BLOCK PROGRESS
// =====================

function calcExerciseVolume(exerciseStats) {
  let total = 0;
  for (const set of (exerciseStats || [])) {
    total += (set.weight || 0) * (set.reps || 0);
  }
  return Math.round(total);
}

function calcExerciseMaxWeight(exerciseStats) {
  let max = 0;
  for (const set of (exerciseStats || [])) {
    if (set.weight != null && set.weight > max) max = set.weight;
  }
  return max;
}

function calcTotalVolume(workout) {
  let total = 0;
  for (const ex of (workout.exercises || [])) {
    if (ex.def?.recordType !== 'strength') continue;
    total += calcExerciseVolume(ex.stats);
  }
  return Math.round(total);
}

// Get non-strength exercises with their time and distance data
function getIndicatorExercises(workout) {
  const indicators = [];
  for (const ex of (workout.exercises || [])) {
    if (ex.def?.recordType === 'strength') continue;
    if (!ex.def?.name) continue;
    // Filter out "Full body warm up" (case insensitive)
    if (ex.def.name.toLowerCase() === 'full body warm up') continue;
    // Get time and distance from stats if available
    let timeSec = null;
    let distance = null;
    for (const s of (ex.stats || [])) {
      if (s.time != null) timeSec = s.time;
      if (s.distance != null) distance = s.distance;
    }
    indicators.push({ name: ex.def.name, timeSec, distance });
  }
  return indicators;
}

// Format seconds to "M:SS"
function fmtTime(sec) {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format distance in km to "X.Xkm"
function fmtDistance(dist) {
  if (dist == null) return null;
  return `${Number(dist).toFixed(1)}km`;
}

// --- Data validation: outlier detection ---

// Build a flag key for lookup
function flagKey(workoutId, exerciseName, setNum) {
  return `${workoutId}:${exerciseName}:${setNum}`;
}

// Detect auto-outliers: any set value > 3x the average for that exercise metric
// Returns a Set of flagKey strings
function detectAutoOutliers(sessions, exerciseTypes) {
  const autoFlags = new Set();

  // Collect all values per exercise across all sessions
  const exerciseValues = {}; // name -> { reps: [], weights: [], times: [] }

  for (const w of sessions) {
    for (const ex of (w.exercises || [])) {
      const rt = ex.def?.recordType;
      if (rt !== 'strength' && !TIMED_RECORD_TYPES.includes(rt)) continue;
      if (!ex.def?.name) continue;
      const name = ex.def.name;
      if (!exerciseValues[name]) exerciseValues[name] = { reps: [], weights: [], times: [], entries: [] };

      for (const [si, s] of (ex.stats || []).entries()) {
        exerciseValues[name].entries.push({ workoutId: w.id, setNum: si + 1, reps: s.reps, weight: s.weight, time: s.time });
        if (s.reps != null && s.reps > 0) exerciseValues[name].reps.push(s.reps);
        if (s.weight != null && s.weight > 0) exerciseValues[name].weights.push(s.weight);
        if (s.time != null && s.time > 0) exerciseValues[name].times.push(s.time);
      }
    }
  }

  for (const [name, data] of Object.entries(exerciseValues)) {
    const exType = exerciseTypes[name] || 'weighted';
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const avgReps = avg(data.reps);
    const avgWeight = avg(data.weights);
    const avgTime = avg(data.times);

    for (const entry of data.entries) {
      let isOutlier = false;

      if (exType === 'time') {
        if (entry.time != null && avgTime > 0 && entry.time > avgTime * 3) isOutlier = true;
      } else if (exType === 'bodyweight') {
        if (entry.reps != null && avgReps > 0 && entry.reps > avgReps * 3) isOutlier = true;
      } else {
        // Weighted: check both reps and weight independently
        if (entry.reps != null && avgReps > 0 && entry.reps > avgReps * 3) isOutlier = true;
        if (entry.weight != null && avgWeight > 0 && entry.weight > avgWeight * 3) isOutlier = true;
      }

      if (isOutlier) {
        autoFlags.add(flagKey(entry.workoutId, name, entry.setNum));
      }
    }
  }

  return autoFlags;
}

// Fetch training plans for a client from Trainerize
async function fetchTrainingPlans(tid) {
  const data = await trainerizePost('/trainingPlan/getList', { userid: Number(tid) });
  if (!data?.plans) return [];
  return data.plans;
}

// GET /api/training/:id/plans - List training plans for plan selector
router.get('/:id/plans', async (req, res) => {
  const { id } = req.params;
  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.trainerize_id) return res.json({ plans: [] });

    const plans = await fetchTrainingPlans(client.trainerize_id);
    const simplified = plans.map(p => ({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      order: p.order,
      duration: p.duration,
      durationType: p.durationType,
    }));
    res.json({ plans: simplified });
  } catch (err) {
    console.error('[Training] Plans error:', err.message);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// GET /api/training/:id/block-progress
router.get('/:id/block-progress', async (req, res) => {
  const { id } = req.params;
  const { planId } = req.query; // optional: specific plan ID to show

  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.trainerize_id) return res.json({ workouts: {}, workoutNames: [], plan: null });

    // Fetch training plans from Trainerize
    const plans = await fetchTrainingPlans(client.trainerize_id);
    if (plans.length === 0) {
      return res.json({ workouts: {}, workoutNames: [], plan: null });
    }

    // Select the plan: specific planId, or current, or most recent previous
    let selectedPlan;
    if (planId) {
      selectedPlan = plans.find(p => p.id === Number(planId));
    }
    if (!selectedPlan) {
      selectedPlan = plans.find(p => p.order === 'Current');
    }
    if (!selectedPlan) {
      // Most recent previous plan
      const previous = plans
        .filter(p => p.order === 'Previous')
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
      selectedPlan = previous[0];
    }
    if (!selectedPlan) {
      return res.json({ workouts: {}, workoutNames: [], plan: null });
    }

    const planStart = selectedPlan.startDate;
    const planEnd = selectedPlan.endDate;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endDate = planEnd && planEnd < today.toISOString().split('T')[0]
      ? planEnd
      : today.toISOString().split('T')[0];

    // Fetch completed workouts within the plan date range
    const workoutIds = await getCompletedWorkoutIds(client.trainerize_id, planStart, endDate);
    if (workoutIds.length === 0) {
      return res.json({
        workouts: {},
        workoutNames: [],
        plan: { id: selectedPlan.id, name: selectedPlan.name, startDate: planStart, endDate: planEnd },
      });
    }

    const allWorkouts = await fetchWorkoutDetails(workoutIds);

    // Query manual flags for this client
    const manualFlagRows = await pool.query(
      `SELECT workout_id, exercise_name, set_num FROM data_error_flags WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    const manualFlags = new Set(manualFlagRows.rows.map(r => flagKey(r.workout_id, r.exercise_name, r.set_num)));

    // Group by workout name
    const byName = {};
    for (const w of allWorkouts) {
      if (!w.name || w.status !== 'tracked') continue;
      if (!WORKOUT_TYPES.includes(w.type)) continue;
      if (!byName[w.name]) byName[w.name] = [];
      byName[w.name].push(w);
    }

    for (const name of Object.keys(byName)) {
      byName[name].sort((a, b) => a.date.localeCompare(b.date));
    }

    const workoutData = {};

    for (const [workoutName, sessions] of Object.entries(byName)) {
      // Collect exercises, max set counts, and exercise types
      const exerciseOrder = [];
      const exerciseSetCounts = {};
      const exerciseTypes = {}; // name -> 'weighted' | 'bodyweight' | 'time'
      const exerciseNameSet = new Set();

      for (const w of sessions) {
        for (const ex of (w.exercises || [])) {
          const rt = ex.def?.recordType;
          if (rt !== 'strength' && !TIMED_RECORD_TYPES.includes(rt)) continue;
          if (!ex.def?.name) continue;
          if (!exerciseNameSet.has(ex.def.name)) {
            exerciseNameSet.add(ex.def.name);
            exerciseOrder.push(ex.def.name);
            exerciseTypes[ex.def.name] = classifyExercise(ex.def, ex.stats);
          } else {
            // Upgrade classification if weight appears in a later session
            // (e.g. bodyweight -> weighted when client adds weight)
            const currentType = exerciseTypes[ex.def.name];
            if (currentType === 'bodyweight') {
              const hasWeight = (ex.stats || []).some(s => s.weight != null && s.weight > 0);
              if (hasWeight) exerciseTypes[ex.def.name] = 'weighted';
            }
          }
          const setCount = (ex.stats || []).length;
          if (!exerciseSetCounts[ex.def.name] || setCount > exerciseSetCounts[ex.def.name]) {
            exerciseSetCounts[ex.def.name] = setCount;
          }
        }
      }

      // Detect auto-outliers for this workout group
      const autoFlags = detectAutoOutliers(sessions, exerciseTypes);
      const allFlags = new Set([...autoFlags, ...manualFlags]);

      // Collect indicator exercises with time data
      const indicatorMap = new Map(); // name -> array of per-session data
      for (const w of sessions) {
        for (const ind of getIndicatorExercises(w)) {
          if (!indicatorMap.has(ind.name)) indicatorMap.set(ind.name, []);
        }
      }

      // Build session columns
      const sessionColumns = sessions.map((w, sessionIdx) => {
        const exerciseData = {};
        for (const ex of (w.exercises || [])) {
          const rt = ex.def?.recordType;
          if (rt !== 'strength' && !TIMED_RECORD_TYPES.includes(rt)) continue;
          if (!ex.def?.name) continue;

          const exType = exerciseTypes[ex.def.name] || classifyExercise(ex.def, ex.stats);

          const sets = (ex.stats || []).map((s, si) => {
            const fk = flagKey(w.id, ex.def.name, si + 1);
            const autoFlagged = autoFlags.has(fk);
            const manualFlagged = manualFlags.has(fk);
            return {
              setNum: si + 1,
              reps: s.reps || null,
              weight: s.weight || null,
              time: s.time || null,
              autoFlagged,
              manualFlagged,
              flagged: autoFlagged || manualFlagged,
            };
          });

          // Filter out flagged sets for metric calculations
          const unflaggedStats = (ex.stats || []).filter((s, si) => {
            return !allFlags.has(flagKey(w.id, ex.def.name, si + 1));
          });

          // Calculate comparison metrics based on exercise type (excluding flagged sets)
          const totalReps = unflaggedStats.reduce((sum, s) => sum + (s.reps || 0), 0);
          const totalTime = unflaggedStats.reduce((sum, s) => sum + (s.time || 0), 0);
          const hasWeight = unflaggedStats.some(s => s.weight != null && s.weight > 0);

          // Filtered volume and max weight
          let filteredVolume = 0;
          for (const s of unflaggedStats) {
            filteredVolume += (s.weight || 0) * (s.reps || 0);
          }
          filteredVolume = Math.round(filteredVolume);

          let filteredMaxWeight = 0;
          for (const s of unflaggedStats) {
            if (s.weight != null && s.weight > filteredMaxWeight) filteredMaxWeight = s.weight;
          }

          exerciseData[ex.def.name] = {
            sets,
            exType,
            volume: filteredVolume,
            maxWeight: filteredMaxWeight,
            totalReps,
            totalTime: Math.round(totalTime),
            hasWeight,
          };
        }

        // Indicator data for this session
        const sessionIndicators = getIndicatorExercises(w);
        const indicatorData = {};
        for (const ind of sessionIndicators) {
          indicatorData[ind.name] = {
            done: true,
            timeSec: ind.timeSec,
            timeStr: fmtTime(ind.timeSec),
            distance: ind.distance,
            distanceStr: fmtDistance(ind.distance),
          };
        }

        // Session total volume from filtered (unflagged) exercise data
        let sessionTotalVolume = 0;
        for (const exName of Object.keys(exerciseData)) {
          const ed = exerciseData[exName];
          if (ed.exType === 'weighted' || ed.exType === 'unknown') {
            sessionTotalVolume += ed.volume;
          }
        }

        return {
          sessionNum: sessionIdx + 1,
          workoutId: w.id,
          date: w.date,
          totalVolume: Math.round(sessionTotalVolume),
          exerciseData,
          indicatorData,
        };
      });

      // Build exercise rows with set sub-rows, colour coding, and arrows
      const exerciseRows = exerciseOrder.map(exName => {
        const maxSets = exerciseSetCounts[exName] || 3;

        const setRows = [];
        for (let setIdx = 0; setIdx < maxSets; setIdx++) {
          const cells = sessionColumns.map((col, colIdx) => {
            const exData = col.exerciseData[exName];
            const setData = exData?.sets?.[setIdx] || null;

            // Arrow on Set 1 only
            let arrow = null;
            const exType = exData?.exType || 'weighted';

            const currFlagged = setData?.flagged || false;

            if (setIdx === 0 && colIdx > 0 && setData && !currFlagged && (setData.reps || setData.weight || setData.time)) {
              for (let p = colIdx - 1; p >= 0; p--) {
                const prevEx = sessionColumns[p].exerciseData[exName];
                const prevSet = prevEx?.sets?.[0];
                if (!prevSet || prevSet.flagged) continue;

                if (exType === 'time') {
                  // Time-based: compare time
                  if (setData.time != null && prevSet.time != null) {
                    if (setData.time > prevSet.time) arrow = 'up';
                    else if (setData.time < prevSet.time) arrow = 'down';
                    else arrow = 'same';
                    break;
                  }
                } else if (exType === 'bodyweight') {
                  // Bodyweight: compare reps only (ignore any weight)
                  if (setData.reps != null && prevSet.reps != null) {
                    if (setData.reps > prevSet.reps) arrow = 'up';
                    else if (setData.reps < prevSet.reps) arrow = 'down';
                    else arrow = 'same';
                    break;
                  }
                } else {
                  // Weighted: check for new weight introduction
                  const prevHadWeight = prevEx?.hasWeight;
                  const currHasWeight = exData?.hasWeight;
                  if (currHasWeight && !prevHadWeight) {
                    // Weight added for first time - amber (progression event)
                    arrow = 'same';
                    break;
                  }
                  // Compare volume
                  if (setData.weight != null && prevSet.weight != null) {
                    const currVol = (setData.reps || 0) * (setData.weight || 0);
                    const prevVol = (prevSet.reps || 0) * (prevSet.weight || 0);
                    if (currVol > prevVol) arrow = 'up';
                    else if (currVol < prevVol) arrow = 'down';
                    else arrow = 'same';
                    break;
                  }
                }
              }
            }

            return {
              reps: setData?.reps || null,
              weight: setData?.weight || null,
              time: setData?.time || null,
              arrow,
              autoFlagged: setData?.autoFlagged || false,
              manualFlagged: setData?.manualFlagged || false,
              flagged: currFlagged,
            };
          });
          setRows.push({ setNum: setIdx + 1, cells });
        }

        // Colour coding at exercise level - handles weighted, bodyweight, and time-based
        const exType = exerciseTypes[exName] || 'weighted';

        const exerciseColors = sessionColumns.map((col, colIdx) => {
          const data = col.exerciseData[exName];
          if (!data) return { volumeColor: 'empty', maxWeightColor: 'empty' };
          if (colIdx === 0) return { volumeColor: 'white', maxWeightColor: 'white' };

          let prevData = null;
          for (let p = colIdx - 1; p >= 0; p--) {
            const pd = sessionColumns[p].exerciseData[exName];
            if (pd) { prevData = pd; break; }
          }

          let volumeColor = 'white';
          let maxWeightColor = 'white';

          if (prevData) {
            if (exType === 'time') {
              // Time-based: compare total time
              if (data.totalTime > prevData.totalTime) volumeColor = 'green';
              else if (data.totalTime === prevData.totalTime) volumeColor = 'amber';
              else volumeColor = 'red';
              maxWeightColor = volumeColor; // same metric for time exercises
            } else if (exType === 'bodyweight') {
              // Bodyweight: compare total reps
              if (data.totalReps > prevData.totalReps) volumeColor = 'green';
              else if (data.totalReps === prevData.totalReps) volumeColor = 'amber';
              else volumeColor = 'red';
              maxWeightColor = volumeColor;
            } else {
              // Weighted: check for weight introduction (progression event)
              if (data.hasWeight && !prevData.hasWeight) {
                // Weight added for first time - always amber
                volumeColor = 'amber';
                maxWeightColor = 'amber';
              } else {
                // Standard weighted comparison
                if (data.volume > prevData.volume) volumeColor = 'green';
                else if (data.volume === prevData.volume) volumeColor = 'amber';
                else volumeColor = 'red';

                if (data.maxWeight > prevData.maxWeight) maxWeightColor = 'green';
                else if (data.maxWeight === prevData.maxWeight) maxWeightColor = 'amber';
                else maxWeightColor = 'red';
              }
            }
          }

          return { volumeColor, maxWeightColor };
        });

        return { exercise: exName, exType, maxSets, setRows, colors: exerciseColors };
      });

      // Indicator rows with time and arrows
      const indicatorNames = [...indicatorMap.keys()];
      // Also add any names found in sessions but not yet in the map
      for (const col of sessionColumns) {
        for (const name of Object.keys(col.indicatorData)) {
          if (!indicatorMap.has(name)) {
            indicatorMap.set(name, []);
            indicatorNames.push(name);
          }
        }
      }

      const indicatorRows = indicatorNames.map(name => ({
        name,
        cells: sessionColumns.map((col, colIdx) => {
          const data = col.indicatorData[name];
          if (!data) return { done: false, timeStr: null, distanceStr: null, arrow: null };

          // Arrow: compare time to previous session (fall back to distance if no time)
          let arrow = null;
          if (colIdx > 0) {
            const currVal = data.timeSec != null ? data.timeSec : data.distance;
            if (currVal != null) {
              for (let p = colIdx - 1; p >= 0; p--) {
                const prev = sessionColumns[p].indicatorData[name];
                if (!prev) continue;
                const prevVal = data.timeSec != null ? prev.timeSec : prev.distance;
                if (prevVal != null) {
                  if (currVal > prevVal) arrow = 'up';
                  else if (currVal < prevVal) arrow = 'down';
                  else arrow = 'same';
                  break;
                }
              }
            }
          }

          return { done: true, timeStr: data.timeStr, distanceStr: data.distanceStr, arrow };
        }),
      }));

      // Session-level total volume colour coding
      const sessionSummary = sessionColumns.map((col, colIdx) => {
        let totalVolumeColor = 'white';
        if (colIdx > 0) {
          const prevVolume = sessionColumns[colIdx - 1].totalVolume;
          if (col.totalVolume > prevVolume) totalVolumeColor = 'green';
          else if (col.totalVolume === prevVolume) totalVolumeColor = 'amber';
          else totalVolumeColor = 'red';
        }
        return {
          sessionNum: col.sessionNum,
          workoutId: col.workoutId,
          date: col.date,
          totalVolume: col.totalVolume,
          totalVolumeColor,
        };
      });

      workoutData[workoutName] = {
        exerciseRows,
        indicatorRows,
        exerciseNames: exerciseOrder,
        sessions: sessionSummary,
        trendData: sessionColumns.map(c => ({ date: c.date, totalVolume: c.totalVolume })),
      };
    }

    res.json({
      workouts: workoutData,
      workoutNames: Object.keys(workoutData).sort(),
      plan: { id: selectedPlan.id, name: selectedPlan.name, startDate: planStart, endDate: planEnd },
      plans: plans.map(p => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, order: p.order })),
    });
  } catch (err) {
    console.error('[Training] Block progress error:', err.message);
    res.status(500).json({ error: 'Failed to fetch block progress' });
  }
});

// POST /api/training/:id/data-flag - Toggle a manual data error flag
router.post('/:id/data-flag', async (req, res) => {
  const { id } = req.params;
  const { workoutId, exerciseName, setNum, flagged } = req.body;

  if (!workoutId || !exerciseName || setNum == null) {
    return res.status(400).json({ error: 'workoutId, exerciseName, and setNum are required' });
  }

  try {
    if (flagged) {
      await pool.query(
        `INSERT INTO data_error_flags (coach_id, client_id, workout_id, exercise_name, set_num)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [COACH_ID, id, workoutId, exerciseName, setNum]
      );
    } else {
      await pool.query(
        `DELETE FROM data_error_flags
         WHERE coach_id = $1 AND client_id = $2 AND workout_id = $3 AND exercise_name = $4 AND set_num = $5`,
        [COACH_ID, id, workoutId, exerciseName, setNum]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Training] Data flag toggle error:', err.message);
    res.status(500).json({ error: 'Failed to toggle data flag' });
  }
});

module.exports = router;
