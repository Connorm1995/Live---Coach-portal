const express = require('express');
const pool = require('../db/pool');
const { trainerizePost: tzPost } = require('../lib/trainerize');
const store = require('../lib/trainerize-store');

const router = express.Router();

const COACH_ID = 1;
const TZ = 'Europe/Dublin';
const TRACKING_THRESHOLD = 0.65; // 65% of calorie goal
const NUTR_SATURATED_FAT = 606; // USDA nutrient number for saturated fat

let _timedOutSections = [];
async function trainerizePost(endpoint, body) {
  const result = await tzPost(endpoint, body, { label: 'Nutrition' });
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

// Extract a nutrient value from the nutrients array by USDA nutrNo
function extractNutrient(nutrients, nutrNo) {
  if (!Array.isArray(nutrients)) return 0;
  const entry = nutrients.find(n => n.nutrNo === nutrNo);
  return entry ? entry.nutrVal : 0;
}

// --- Date helpers (Europe/Dublin timezone) ---

function dublinDate(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: TZ });
}

function getTodayDublin() {
  return dublinDate(new Date());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function getPreviousFullWeekRange() {
  const today = getTodayDublin();
  const thisMonday = getMondayOf(today);
  const prevMonday = addDays(thisMonday, -7);
  const prevSunday = addDays(thisMonday, -1);
  return { start: prevMonday, end: prevSunday };
}

function dateRange(start, end) {
  const dates = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNameFromDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAY_NAMES[d.getUTCDay()];
}

function dayShortFromDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAY_SHORT[d.getUTCDay()];
}

// GET /api/nutrition/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [clientResult, settingsResult] = await Promise.all([
      pool.query(
        `SELECT id, trainerize_id, mfp_url FROM clients WHERE id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
      pool.query(
        `SELECT fibre_target FROM client_settings WHERE client_id = $1 AND coach_id = $2`,
        [id, COACH_ID]
      ),
    ]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const tid = client.trainerize_id;
    const mfpUrl = client.mfp_url || null;
    const fibreTarget = settingsResult.rows[0]?.fibre_target ?? 20;

    if (!tid) {
      return res.json({
        mfpUrl,
        goals: null,
        actuals: null,
        weekSummary: null,
        dailyBreakdown: [],
        fibreTarget,
      });
    }

    const prevWeek = getPreviousFullWeekRange();
    const today = getTodayDublin();
    const thisMonday = getMondayOf(today);
    const twoWeeksAgo = addDays(thisMonday, -14);
    const breakdownEnd = today;
    const breakdownStart = twoWeeksAgo;

    // Fetch previous week via per-day /get calls (gives us nutrients array with sat fat)
    // and breakdown data via /getList (faster, but no nutrients)
    const prevWeekDates = dateRange(prevWeek.start, prevWeek.end);

    const [breakdownData, ...prevWeekDayResults] = await Promise.all([
      store.getNutritionData(id, tid, breakdownStart, breakdownEnd),
      ...prevWeekDates.map(date =>
        store.getNutritionDetail(id, tid, date)
      ),
    ]);

    // Build previous week day map from per-day responses
    const prevWeekDayMap = {};
    for (const result of prevWeekDayResults) {
      if (result?.nutrition) {
        prevWeekDayMap[result.nutrition.date] = result.nutrition;
      }
    }

    // Extract goals from the first day that has goal data
    let goals = null;
    for (const date of prevWeekDates) {
      const day = prevWeekDayMap[date];
      if (day?.goal?.caloricGoal) {
        goals = {
          calories: Math.round(day.goal.caloricGoal),
          protein: Math.round(day.goal.proteinGrams),
          fats: Math.round(day.goal.fatGrams),
          carbs: Math.round(day.goal.carbsGrams),
          fibre: fibreTarget,
        };
        break;
      }
    }

    // If no goals from per-day, try breakdown data
    if (!goals) {
      const allDays = breakdownData?.nutrition || [];
      for (const day of allDays) {
        if (day?.goal?.caloricGoal) {
          goals = {
            calories: Math.round(day.goal.caloricGoal),
            protein: Math.round(day.goal.proteinGrams),
            fats: Math.round(day.goal.fatGrams),
            carbs: Math.round(day.goal.carbsGrams),
            fibre: fibreTarget,
          };
          break;
        }
      }
    }

    // Calculate smart averages (only days >= 65% calorie goal tracked)
    const includedDays = [];
    const excludedDays = [];

    for (const date of prevWeekDates) {
      const day = prevWeekDayMap[date];
      const calorieGoal = goals?.calories || 0;
      const tracked = day?.calories || 0;
      const dayName = dayShortFromDate(date);

      if (calorieGoal > 0 && tracked >= calorieGoal * TRACKING_THRESHOLD) {
        includedDays.push({
          date,
          dayName,
          calories: day.calories || 0,
          protein: day.proteinGrams || 0,
          fats: day.fatGrams || 0,
          carbs: day.carbsGrams || 0,
          fibre: day.fiberGrams || 0,
          saturatedFat: extractNutrient(day.nutrients, NUTR_SATURATED_FAT),
        });
      } else {
        excludedDays.push({ date, dayName });
      }
    }

    let actuals = null;
    if (includedDays.length > 0) {
      const count = includedDays.length;
      actuals = {
        calories: Math.round(includedDays.reduce((s, d) => s + d.calories, 0) / count),
        protein: Math.round(includedDays.reduce((s, d) => s + d.protein, 0) / count),
        fats: Math.round(includedDays.reduce((s, d) => s + d.fats, 0) / count),
        carbs: Math.round(includedDays.reduce((s, d) => s + d.carbs, 0) / count),
        fibre: Math.round(includedDays.reduce((s, d) => s + d.fibre, 0) / count),
        saturatedFat: Math.round(includedDays.reduce((s, d) => s + d.saturatedFat, 0) / count),
      };
    }

    const weekSummary = {
      included: includedDays.map(d => d.dayName),
      excluded: excludedDays.map(d => d.dayName),
      range: prevWeek,
    };

    // --- Daily Breakdown ---
    // Use getList for the full 3-week range (no sat fat here, it's only in /get)
    const allNutritionDays = breakdownData?.nutrition || [];
    const allDayMap = {};
    for (const day of allNutritionDays) {
      allDayMap[day.date] = day;
    }
    // Merge in previous week detail data (which has nutrients/sat fat)
    for (const date of prevWeekDates) {
      if (prevWeekDayMap[date]) {
        allDayMap[date] = prevWeekDayMap[date];
      }
    }

    const week1Start = twoWeeksAgo;
    const week1End = addDays(week1Start, 6);
    const week2Start = addDays(twoWeeksAgo, 7);
    const week2End = addDays(week2Start, 6);
    const week3Start = thisMonday;
    const week3End = today;

    function buildWeek(start, end, label) {
      const dates = dateRange(start, end);
      const calorieGoal = goals?.calories || 0;

      return {
        label,
        start,
        end,
        days: dates.map(date => {
          const day = allDayMap[date];
          const calories = day?.calories || 0;
          const tracked = calorieGoal > 0 ? calories / calorieGoal : 0;
          const sufficientTracking = tracked >= TRACKING_THRESHOLD;

          return {
            date,
            dayName: dayNameFromDate(date),
            dayShort: dayShortFromDate(date),
            calories: Math.round(calories),
            protein: Math.round(day?.proteinGrams || 0),
            fats: Math.round(day?.fatGrams || 0),
            carbs: Math.round(day?.carbsGrams || 0),
            fibre: Math.round(day?.fiberGrams || 0),
            saturatedFat: Math.round(extractNutrient(day?.nutrients, NUTR_SATURATED_FAT)),
            trackingPercent: Math.round(tracked * 100),
            sufficientTracking,
          };
        }),
      };
    }

    const dailyBreakdown = [
      buildWeek(week3Start, week3End, 'Current Week'),
      buildWeek(week2Start, week2End, 'Last Week'),
      buildWeek(week1Start, week1End, 'Two Weeks Ago'),
    ];

    res.json({
      mfpUrl,
      goals,
      actuals,
      weekSummary,
      dailyBreakdown,
      fibreTarget,
    });
  } catch (err) {
    console.error('[Nutrition] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch nutrition data' });
  }
});

module.exports = router;
