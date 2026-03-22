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
      console.warn(`[Calendar] Trainerize ${endpoint} returned ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[Calendar] Trainerize ${endpoint} error:`, err.message);
    return null;
  }
}

// --- Date helpers ---

// Get start/end dates for a given month (YYYY-MM format)
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

// --- Client helper ---
async function getClient(id) {
  const result = await pool.query(
    `SELECT id, name, trainerize_id FROM clients WHERE id = $1 AND coach_id = $2`,
    [id, COACH_ID]
  );
  return result.rows[0] || null;
}

// --- Workout type constants (match training.js) ---
const WORKOUT_TYPES = ['workout', 'workoutRegular', 'workoutCircuit', 'workoutTimed', 'workoutInterval', 'workoutVideo'];
const WALKING_NAMES = ['walking', 'walk', 'hiking', 'hike'];

function isWalkingSession(name) {
  return WALKING_NAMES.some(w => name.toLowerCase().includes(w));
}

// Check walking thresholds: distance > 3km, duration > 45min, maxHR > 100
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

// Fetch workout details in batches
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

// Extract duration/distance from workout detail
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
  if (trackingDuration && trackingDuration > totalDuration) {
    totalDuration = trackingDuration;
  }

  return {
    duration: totalDuration > 0 ? totalDuration : null,
    distance: totalDistance > 0 ? Math.round(totalDistance * 100) / 100 : null,
  };
}

// Format duration in seconds to human-readable
function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

// --- Fetch body weight entries per day (same pattern as overview.js) ---
async function fetchWeightEntries(tid, startDate, endDate) {
  if (!tid) return [];

  const lastEntry = await trainerizePost('/bodystats/get', {
    userID: Number(tid),
    date: 'last',
    unitWeight: 'kg',
    unitBodystats: 'cm',
  });

  if (!lastEntry || lastEntry.code !== 200 || !lastEntry.bodyMeasures?.bodyWeight) return [];
  if (lastEntry.date < startDate) return [];

  const dates = dateRange(startDate, endDate);
  const entries = [];

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

  return entries;
}

// --- Parse sleep data (same pattern as overview.js) ---
function parseSleepData(response, allDates) {
  const TZ = 'Europe/Dublin';

  function toLocalHour(date) {
    const parts = new Intl.DateTimeFormat('en-IE', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    return parseInt(hourPart.value, 10);
  }

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
        nights[nightDate] = { totalMin: 0 };
      }
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

// GET /api/calendar/:id?month=YYYY-MM
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const monthParam = req.query.month;

  try {
    const client = await getClient(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const tid = client.trainerize_id;
    if (!tid) {
      return res.json({ days: [], month: getMonthRange(monthParam) });
    }

    const range = getMonthRange(monthParam);
    const allDates = dateRange(range.startDate, range.endDate);

    // Fetch calendar, nutrition, sleep, and weight data in parallel
    const [calendarData, nutritionData, sleepData, weightEntries] = await Promise.all([
      trainerizePost('/calendar/getList', {
        userID: Number(tid),
        startDate: range.startDate,
        endDate: range.endDate,
        unitWeight: 'kg',
      }),
      trainerizePost('/dailyNutrition/getList', {
        userID: Number(tid),
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      trainerizePost('/healthData/getListSleep', {
        userID: Number(tid),
        startTime: range.startDate + ' 00:00:00',
        endTime: range.endDate + ' 23:59:59',
      }),
      fetchWeightEntries(tid, range.startDate, range.endDate),
    ]);

    if (!calendarData?.calendar) {
      return res.json({ days: [], month: range });
    }

    // Build lookup maps for nutrition, sleep, weight
    const nutritionMap = {};
    if (nutritionData?.nutrition && Array.isArray(nutritionData.nutrition)) {
      for (const day of nutritionData.nutrition) {
        if (day.date) {
          const calories = Math.round(day.calories || 0);
          const calorieGoal = day.goal?.caloricGoal || 0;
          const insufficientTracking = calorieGoal > 0 && calories < calorieGoal * 0.65;
          nutritionMap[day.date] = {
            calories,
            protein: Math.round(day.proteinGrams || 0),
            insufficientTracking,
          };
        }
      }
    }

    const sleepMap = parseSleepData(sleepData, allDates);

    const weightMap = {};
    for (const entry of weightEntries) {
      if (entry.date && entry.weight != null) {
        weightMap[entry.date] = entry.weight;
      }
    }

    // Parse calendar items into structured days
    const dayMap = {};
    const walkingIds = [];
    const cardioIds = [];

    for (const day of calendarData.calendar) {
      const date = day.date;
      if (!date) continue;

      const items = day.items || [];
      if (!dayMap[date]) {
        dayMap[date] = { date, activities: [], bodyStatsLogged: false };
      }

      for (const item of items) {
        const isWorkout = WORKOUT_TYPES.includes(item.type);
        const isCardio = item.type === 'cardio';
        const isBodystat = item.type === 'bodystat';

        if (isBodystat) {
          dayMap[date].bodyStatsLogged = true;
          continue;
        }

        if (!isWorkout && !isCardio) continue;

        const completed = item.status === 'tracked' || item.status === 'checkedIn';
        const name = item.title || 'Session';

        if (isWorkout) {
          dayMap[date].activities.push({
            id: item.id,
            type: 'strength',
            name,
            status: completed ? 'completed' : 'scheduled',
          });
        } else if (isCardio) {
          const isWalking = isWalkingSession(name);

          if (isWalking && completed) {
            walkingIds.push(item.id);
          }
          if (isCardio && completed) {
            cardioIds.push(item.id);
          }

          dayMap[date].activities.push({
            id: item.id,
            type: isWalking ? 'walking' : 'cardio',
            name,
            status: completed ? 'completed' : 'scheduled',
            _pendingWalkingFilter: isWalking && completed,
            _needsMeta: completed,
          });
        }
      }
    }

    // Fetch workout details for completed cardio/walking to get duration/distance and walking filter
    const detailIds = [...new Set([...walkingIds, ...cardioIds])];
    const details = await fetchWorkoutDetails(detailIds);
    const detailMap = {};
    for (const d of details) {
      detailMap[d.id] = d;
    }

    // Apply walking filter and enrich with duration/distance
    const days = [];
    for (const date of Object.keys(dayMap).sort()) {
      const dayData = dayMap[date];
      const filteredActivities = [];

      for (const activity of dayData.activities) {
        // Walking filter: completed walking must meet threshold
        if (activity._pendingWalkingFilter) {
          const detail = detailMap[activity.id];
          if (!detail || !walkingMeetsThreshold(detail)) {
            continue; // Filter out walking that doesn't meet threshold
          }
        }
        // Scheduled walking is not shown (no data to filter on)
        if (activity.type === 'walking' && activity.status === 'scheduled') {
          continue;
        }

        // Enrich cardio/walking with duration/distance
        if (activity._needsMeta && detailMap[activity.id]) {
          const meta = extractActivityMeta(detailMap[activity.id]);
          if (meta.duration) activity.duration = formatDuration(meta.duration);
          if (meta.distance) activity.distance = `${meta.distance}km`;
        }

        // Clean internal flags
        delete activity._pendingWalkingFilter;
        delete activity._needsMeta;

        filteredActivities.push(activity);
      }

      const dayResult = {
        date: dayData.date,
        activities: filteredActivities,
        bodyStatsLogged: dayData.bodyStatsLogged,
      };

      // Add weight if logged
      if (weightMap[dayData.date] != null) {
        dayResult.weight = weightMap[dayData.date];
      }

      // Add nutrition if calories > 0
      const nutr = nutritionMap[dayData.date];
      if (nutr && nutr.calories > 0) {
        dayResult.calories = nutr.calories;
        if (nutr.protein > 0) {
          dayResult.protein = nutr.protein;
        }
        if (nutr.insufficientTracking) {
          dayResult.insufficientTracking = true;
        }
      }

      // Add sleep if hours > 0
      if (sleepMap[dayData.date] != null) {
        dayResult.sleep = sleepMap[dayData.date];
      }

      days.push(dayResult);
    }

    res.json({ days, month: range });
  } catch (err) {
    console.error('[Calendar] Error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

module.exports = router;
