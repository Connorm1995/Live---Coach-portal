# Logic Handbook

This document explains the reasoning behind every logic decision in the portal. Written so a non-technical person can read it and understand exactly why the portal behaves the way it does.

Last updated: July 2026

---

## Training Tab

### Walking/Hiking Filter

**What it does:** Walking and hiking sessions only appear on the Session Calendar if they meet at least one of three thresholds:

- Distance over 3km
- Duration over 45 minutes
- Max heart rate over 100bpm

**Why:** Most clients log casual walking throughout the day via their watch or phone. These short, low-intensity walks (e.g. walking to the shop, walking around the office) are not meaningful training sessions and would clutter the calendar with noise. A 10-minute walk to the car park does not belong next to a strength session.

The three thresholds are designed to catch genuinely effortful walking or hiking:

- **3km distance** filters out anything shorter than a purposeful walk. Most casual daily walks are under 2km.
- **45 minutes duration** catches longer walks even if they are slow-paced or the distance data is missing.
- **100bpm max heart rate** catches any walk that actually elevated the client's heart rate, even if short. Resting heart rate for most adults is 60-80bpm, so 100bpm means the walk had some physical demand.

If a walk meets *any one* of these three, it appears. If it meets none, it is silently filtered out. Planned (scheduled but not yet completed) walking sessions are not shown at all since there is no data to filter on.

**Data source:** The heart rate comes from `dailyWorkouts[].trackingStats.stats.maxHeartRate`. Distance and duration come from the exercise-level stats within the workout detail.

---

### Data Validation (Outlier Detection and Manual Flags)

The portal has two layers of data validation that work together to handle data entry errors. Both layers behave identically in terms of their effect: flagged values are greyed out in the grid and excluded from all calculations (colour coding, arrows, current best in Key Lifts, progress percentages, trend lines, and total volume). The only difference is the icon used.

**Layer 1 - Automatic outlier detection (warning icon):**

The system automatically scans every set value for each exercise and flags any value that is more than 3x the average for that metric. For example, if a client typically does 15 reps of push-ups per set, and one set says 157 reps, that is clearly a typo. The system calculates the average across all sets for that exercise and flags the 157 because it is more than 3 times the average of roughly 15.

Which metric is checked depends on the exercise type:
- **Weighted exercises**: both reps and weight are checked independently. If either is more than 3x its own average, the set is flagged.
- **Bodyweight exercises**: reps are checked against the average reps.
- **Time-based exercises**: time is checked against the average time.

Auto-flagged cells display a small warning icon so Connor can see them at a glance without needing to look at the numbers.

**Why 3x the average:** This threshold is deliberately generous. A client who normally lifts 60kg is unlikely to suddenly lift 180kg - that is almost certainly a data entry error. But a client who normally does 10 reps might genuinely do 25 reps on a good day (2.5x average), which should not be flagged. The 3x threshold catches obvious typos (like 157 instead of 15, or 600 instead of 60) while leaving legitimate performance variations alone.

**Layer 2 - Manual flags (flag icon):**

Every cell in the grid has a small flag button that appears on hover. Connor can click it to manually mark any value as a data error. This covers cases that the automatic detection does not catch - for example, if a client entered 30kg instead of 60kg (half the correct value), the automatic system would not flag it because it is below the average, not above it. But Connor knows the client's program and can spot these errors himself.

Manually flagged cells display a small flag icon. Connor can unflag a cell by clicking the button again. Flags are stored in the database per client, exercise, session, and set number, so they persist across sessions.

**Why two layers:** Automatic detection catches the obvious typos that would otherwise distort every calculation in the portal. Manual flags catch the subtler errors that only a coach would recognise. Together, they ensure the data Connor sees and shows to clients on Loom recordings is accurate.

---

### Training Block Progress - Colour Coding

**What it does:** Each cell in the block progress grid is colour-coded based on how that exercise performed compared to the previous session.

**The colours:**

| Colour | Meaning |
|--------|---------|
| White | Baseline session (Session 1). Nothing to compare against. |
| Green | Improved vs the previous comparable session |
| Amber | Same as the previous comparable session |
| Red | Below the previous comparable session |

**Why Session 1 is always white:** The very first session in a training block is the starting point. There is no previous session to compare it to, so it makes no sense to colour it green, amber, or red. It is neutral by definition. This prevents a misleading impression that the first session was "bad" or "good" when it is simply the baseline.

**Why "improved" means green and "below" means red:** This follows universal traffic-light logic. Green means progress, red means regression. Amber sits in between and means the client maintained their performance, which is neither good nor bad. Connor uses this at a glance during Loom recordings to quickly identify which exercises are trending up, staying flat, or dropping off.

**Comparison logic:** Each session is compared to the session immediately before it. Session 2 compares to Session 1, Session 3 compares to Session 2, and so on.

**Grid layout:** The grid shows actual sets - rows are exercises with sub-rows for Set 1, Set 2, Set 3 etc., and columns are sessions. Each cell displays the actual reps and weight (e.g. "12 x 60kg"), bodyweight reps (e.g. "15 reps"), or time (e.g. "1:30") depending on the exercise type. This gives Connor and the client a clear, detailed view of exactly what was done in every session.

---

### Exercise Type Classification

Every exercise in the grid falls into one of three categories. The system determines the category automatically based on what data Trainerize records for that exercise.

**Weighted exercises** - exercises where the client logs a weight. Examples: lat pulldowns, bench press, deadlifts, leg press, shoulder press, Romanian deadlifts. The comparison metric is **total volume** (reps x weight, summed across all sets). If the client did more total volume than last session, it is green. Same volume is amber. Less volume is red.

**Bodyweight exercises** - exercises where the client logs reps but no weight. Examples: push-ups, deficit push-ups, dips, pull-ups, inverted rows, bodyweight split squats, bodyweight lunges, step-ups. The comparison metric is **total reps** (summed across all sets). More reps = green. Same reps = amber. Fewer reps = red. Weight is irrelevant because the client is using their own body weight.

**Time-based exercises** - exercises where the client logs time. Examples: planks, dead hangs, wall sits, isometric holds. The comparison metric is **total time in seconds** (summed across all sets). Longer = green. Same = amber. Shorter = red.

**Why these three categories:** Different exercises measure progress in fundamentally different ways. Comparing a push-up session to a previous push-up session by "volume" (reps x weight) would always show zero because there is no weight. Comparing a plank to a previous plank by reps would also show zero. The system detects which data the client is actually logging and uses the appropriate metric automatically.

**Weight introduction rule:** If an exercise had no weight in the previous session but has weight in the current session (e.g. the client progressed from bodyweight split squats to weighted split squats), the comparison always shows **amber**. This is a progression event, not a regression. The total volume will technically be "less" because the previous session's reps-only data has no weight component, but showing red would be misleading because the client is actually advancing. Amber signals "this session is different, take note" without implying failure.

**Toggle between Total Volume and Max Weight:**

- **Total Volume** = for weighted exercises, sets x reps x weight. For bodyweight exercises, total reps. For time-based exercises, total seconds.
- **Max Weight** = the heaviest single set for weighted exercises. For bodyweight and time-based exercises, this shows the same result as total volume since there is no weight to compare.

Connor can switch between these two views depending on what he wants to assess. Volume is useful for hypertrophy-focused phases. Max weight is useful for strength-focused phases. The colour coding changes to reflect whichever metric is selected.

**Cardio indicator rows:** Non-strength exercises like rowing and running are shown at the bottom of the grid with time and distance where available. They use the same arrow indicators as strength exercises - comparing time to the previous session. The "Full body warm up" row is excluded entirely as it adds no value to the grid.

---

### Program Boundaries (Training Plans as Source of Truth)

**What it does:** The block progress grid uses Trainerize's `/trainingPlan/getList` API to determine which sessions belong to which program. Each training plan in Trainerize has a name, start date, and end date. The grid only shows sessions that fall within the selected plan's date range.

**Why:** Connor creates named training plans in Trainerize (e.g. "PHASE 1 - 2026", "Phase 2 - 2026") with defined start and end dates. These plans are the authoritative boundary for what constitutes a "training block." Using Trainerize's own plan data means the portal always matches what Connor has set up, with no guesswork or inference.

**How it works:** The system calls `/trainingPlan/getList` for the client and gets all plans with their date ranges. By default, it shows the current plan (marked as "Current" by Trainerize). Connor can also select any previous plan from a dropdown to review older blocks. Only completed sessions within the selected plan's start and end dates are included in the grid.

**Plan selector:** A dropdown in the header lets Connor switch between plans. This is useful for reviewing a client's progress in a completed block, or comparing the current block to a previous one.

**Why not exercise overlap detection:** An earlier version of this system tried to auto-detect program changes by comparing exercise lists between sessions. This was unreliable because it required guessing where one program ended and another began. Using Trainerize's own plan data eliminates the guesswork entirely - the boundaries are exactly what Connor set them to be.

---

### Key Lifts Tracker - Colour Scheme

**What it does:** Each key lift shows the client's current best as a percentage of their target. The percentage and progress bar are colour-coded:

| Range | Colour | Meaning |
|-------|--------|---------|
| 0-40% | Slate grey | Early stages, a long way from target |
| 40-70% | Teal | Making progress, building toward the goal |
| 70-90% | Amber | Getting close, within striking distance |
| 90-100%+ | Green | At or above the target |

**Target types:** Connor can set three kinds of targets depending on the exercise:

| Target type | What it measures | Current best calculation | Example |
|-------------|------------------|--------------------------|---------|
| 1RM / 5RM / 10RM | Heaviest weight lifted for a given rep range | Heaviest set where the client completed at least that many reps with weight | Target: 100kg bench press for 5 reps. Best: 80kg (done 5 reps at 80kg). Progress: 80% |
| Max Reps (bodyweight) | Most reps without weight | Highest single-set rep count where no weight was added | Target: 20 push-ups. Best: 15 reps. Progress: 75% |
| Max Time | Longest hold or duration | Longest single set in seconds | Target: 60 second plank. Best: 45 seconds. Progress: 75% |

**Why three target types:** Different exercises measure progress differently. A bench press target is about how much weight the client can move. A push-up target is about how many reps they can do unweighted. A plank target is about how long they can hold. Using the wrong metric would produce meaningless percentages.

**Why no red:** Red implies failure or danger. A client who is at 30% of a long-term strength target is not failing. They are simply early in their journey. Using red here would create a negative emotional response when Connor shows this screen during a Loom recording. Slate grey is neutral and factual. It says "you are here" without any judgement.

**Why these percentage bands:**

- **0-40% is grey** because at this stage the target is aspirational and the client needs encouragement, not pressure. Grey keeps it neutral.
- **40-70% is teal** (the brand colour) because this is the active building phase. The client is making real progress and the teal colour reflects positive momentum without overpromising.
- **70-90% is amber** because the client is close and this creates a sense of "nearly there" anticipation. Amber signals attention and focus.
- **90%+ is green** because hitting the target is the goal. Green is the reward colour and provides positive reinforcement.

---

### Session Calendar - Colour Categories

**What it does:** Sessions on the calendar are colour-coded by type:

| Type | Colour | Examples |
|------|--------|---------|
| Strength training | Blue | Strength & Conditioning 1, Strength & Conditioning 2 |
| Planned cardio | Green | Pickleball, Running, Cycling |
| Walking/Hiking | Yellow | Walking, Hiking (only if meets threshold) |

**Why these colours:**

- **Blue for strength** is industry-standard for weight training. It is distinct from the status colours (green/amber/red) used elsewhere, so there is no confusion between "this is a strength session" and "this session went well."
- **Green for cardio** represents activity and energy. It matches the health/fitness association people naturally have with green.
- **Yellow for walking** separates it visually from programmed cardio. Walking is a different category - it is important for general health but is not a structured training session. Yellow gives it presence without making it as prominent as the programmed blue or green sessions.

**Scheduled vs completed:** Sessions that have been completed are shown as filled (solid colour). Sessions that are scheduled but not yet done are shown as outline only (border with no fill). This gives Connor an instant visual read on compliance without needing to count numbers.

---

## Nutrition Tab

### 65% Tracking Threshold

**What it does:** When calculating weekly nutrition averages, any day where the client tracked less than 65% of their daily calorie goal is excluded from the average. The excluded days are listed below the Goals vs Actuals table so Connor can see exactly which days were included and which were dropped.

**Why:** Many clients skip tracking on weekends or social days. If those zero or near-zero days are included in the average, they drag the numbers down dramatically and give a misleading picture of the client's actual eating habits on the days they did track. For example, a client who eats 2,100 kcal consistently Mon-Fri but logs nothing on Saturday and Sunday would show a weekly average of 1,500 kcal - which is completely wrong.

The 65% threshold is deliberately lower than 100% to allow for partial tracking days. A client who logs breakfast and lunch but forgets dinner might still hit 60-70% of their calorie goal. At 65%, these partial days are included (they tracked the majority of the day), but a day where the client logged one snack and nothing else (hitting maybe 10-20%) is correctly excluded.

**How to apply:** The threshold is applied per day. The calorie goal comes from Trainerize. If a day has no calorie goal set, it is excluded. The average is calculated only from included days.

---

### Fibre Target Default of 20g

**What it does:** Every client defaults to a 20g daily fibre target. Connor can override this per client from the Client Manager in Coach's Corner.

**Why:** Trainerize does not store a fibre goal - only calories, protein, fat, and carbs have goals in the Trainerize system. Since fibre is an important metric that Connor reviews with clients, we need a default. 20g is a reasonable baseline for most adults and aligns with general dietary guidelines. If a client has different needs (e.g. higher fibre for digestive health, or lower for a specific medical condition), Connor can adjust it individually.

**How to apply:** The fibre target is stored in the client_settings table. The Nutrition tab reads it from there. If no record exists, it defaults to 20g.

---

### Goals vs Actuals - Colour Coding

**What it does:** The Difference column in the Goals vs Actuals table is colour-coded to show at a glance whether the client is hitting their targets.

**The colours:**

| Macro | Green means | Red means | Amber means |
|-------|-------------|-----------|-------------|
| Calories | At or below goal | Significantly above goal | Within 10% of goal |
| Protein | At or above goal | Significantly below goal | Within 10% of goal |
| Fats | At or below goal | Significantly above goal | Within 10% of goal |
| Carbs | Within 10% of goal | N/A (neutral) | Within 10% of goal |
| Fibre | At or above goal | Significantly below goal | Within 10% of goal |

**Why the directions differ:** Each macro has a different relationship with its goal:

- **Calories** should be at or below goal because most clients are in a deficit or maintenance phase. Going over is the concern.
- **Protein** should be at or above goal because it is the hardest macro to hit and the most important for body composition. Being under is the concern.
- **Fats** should be at or below goal because excess fat intake often means excess calories from less satiating sources.
- **Carbs** are neutral because carb targets vary by phase and individual preference. Being slightly over or under is not inherently good or bad.
- **Fibre** should be at or above goal because most clients under-eat fibre. Getting more than the target is a positive.

**Why 10% for amber:** A client who aims for 2,000 kcal and hits 2,150 kcal (7.5% over) is not meaningfully off target. The 10% buffer accounts for normal daily variation, rounding in food tracking, and the inherent imprecision of calorie counting. It prevents the table from showing red for insignificant differences that would alarm the client during a Loom recording.

---

### Saturated Fat Gauge

**What it does:** Saturated fat has its own dedicated visual section with a horizontal gauge showing the client's weekly average as a percentage of total calories, plotted against two international health guidelines.

**The gauge:**

The gauge shows one threshold at 10% of total daily calories, which is the WHO (World Health Organization) recommended maximum for saturated fat intake. The client's weekly average is plotted as a marker on the scale.

**Colour coded flagging:**

| Zone | Colour | Meaning |
|------|--------|---------|
| Below 10% | Green | Within WHO recommended threshold |
| Above 10% | Amber | Above the WHO recommended threshold - worth discussing sources |

**Why only WHO and not AHA:** The AHA 6% threshold was removed because it created unnecessary alarm for clients who are within a broadly accepted health guideline (WHO 10%). Most coaching clients are not cardiology patients. The WHO 10% threshold is the more universally applicable standard and gives Connor a single clear line to reference during Loom recordings. If a client is above 10%, the amber label "worth discussing sources" prompts a constructive conversation about food choices rather than a clinical warning.

**Why no red:** Saturated fat is a nuanced topic. A client at 13% is not in danger - they are eating more saturated fat than recommended and it is worth a conversation, but it should not look like an emergency on screen. Amber conveys "pay attention" without the alarm of red, which keeps the Loom recording tone constructive rather than clinical.

**Why percentage of calories rather than grams:** Saturated fat intake should be relative to total calorie intake. A client eating 3,000 kcal per day can tolerate more grams of saturated fat than a client eating 1,500 kcal. Showing the percentage gives a fair comparison regardless of the client's calorie target.

**Data source:** Saturated fat comes from the Trainerize API via the `/dailyNutrition/get` endpoint's `nutrients` array (USDA nutrient number 606). It is not available in the bulk `/dailyNutrition/getList` endpoint, so per-day API calls are made for the previous week.

---

### Daily Breakdown - Stacked Macro Bars

**What it does:** Each day in the breakdown shows a horizontal stacked bar with three proportional colour-coded segments representing protein (blue), fats (amber), and carbs (green). The calorie total appears large and bold to the left.

**Why stacked bars:** The stacked bar shows macro composition at a glance without needing numbers. Connor can instantly see if a client's day was heavily carb-dominant (mostly green) or well-balanced (roughly even segments). This visual pattern recognition is much faster than reading numbers, especially during a Loom recording where the screen is visible for only a few seconds per day.

**Why only protein, fats, and carbs in the bar:** These three macros account for all calorie-bearing intake and always sum to a meaningful total. Fibre and saturated fat are subsets of carbs and fats respectively, so including them would double-count. They appear in the expanded detail view instead.

**Muted days:** Days with insufficient tracking (under 65% of calorie goal) show the stacked bar at reduced opacity with a "partial" label. The data is still visible but clearly marked as unreliable. This is better than hiding the data entirely because Connor may still want to glance at what was logged.

---

### Daily Breakdown - Date Range

**What it does:** The daily breakdown shows three groups: the current week (Monday to today), last week (full Mon-Sun), and two weeks ago (full Mon-Sun).

**Why three weeks:** Connor needs to see trends, not just a single week snapshot. Two full previous weeks plus the current week gives enough history to spot patterns (e.g. "client drops tracking every Friday") while keeping the view focused and not overwhelming. The current week shows progress in real time so Connor can flag issues before the week is over.

**Why Monday to Sunday:** All weeks in the portal run Monday to Sunday, matching the weekly check-in cycle and how most people think about their week in Ireland and the UK.

---

### MyFitnessPal Day-Level Deep Links

**What it does:** Each day row in the Daily Breakdown has a small link icon that opens that specific day's food diary directly in MyFitnessPal. The URL format is `https://www.myfitnesspal.com/food/diary/[username]?date=YYYY-MM-DD`.

**How it works:** The client's MFP diary URL is stored in the `mfp_url` column on the `clients` table (e.g. `https://www.myfitnesspal.com/food/diary/smarttbrendan`). The portal extracts the username from this URL and appends a `?date=` parameter for day-level links. If no MFP URL is set for a client, the link icon does not appear.

**Why:** When Connor is reviewing a client's nutrition on a Loom recording and sees a day with unusual numbers, he can click directly into that day's MFP diary to see exactly what the client ate. Without this, he would have to manually navigate to MFP, find the client, and scroll to the correct date. The deep link removes several clicks and keeps the Loom recording smooth.

**Why the icon is on the day row rather than a separate button:** Each day's food diary is different. A single "Open MFP" button at the top opens the diary to today by default, which is rarely the day Connor wants to review. Day-level links let him jump to any specific day instantly.

---

## Calendar Tab

### Data Fetching

**What it does:** The Calendar tab fetches a full month of data from Trainerize using `POST /calendar/getList` with the client's `trainerize_id`, a `startDate` of the first day of the month, and an `endDate` of the last day of the month. The backend endpoint is `GET /api/calendar/:id?month=YYYY-MM`, defaulting to the current month if no `month` parameter is provided.

**How it works:** The Trainerize `/calendar/getList` response returns a `calendar` array where each element represents a day. Each day has an `items` array containing objects with `type` (workout, workoutRegular, cardio, bodystat, etc.), `title`, `status` (scheduled, tracked, checkedIn), and `id`. The backend parses these into a structured response: an array of days, each with a `date`, an `activities` array, and a `bodyStatsLogged` boolean.

**Why a dedicated route:** The Training tab's session calendar uses the same Trainerize endpoint but over a different date range (last 2 full weeks + current week). The Calendar tab needs a full month at a time with month-to-month navigation, so it has its own endpoint with a month parameter.

---

### Activity Type Colour Coding

**What it does:** Activities in the calendar are colour-coded by type. These colours match the Training tab's session calendar exactly:

| Type | Colour | Filled (completed) | Outline (scheduled) |
|------|--------|---------------------|---------------------|
| Strength training | Blue (#3b82f6) | Solid blue background, white text | Blue border, blue text, italic |
| Cardio | Green (--color-green) | Solid green background, white text | Green border, green text, italic |
| Walking/Hiking | Yellow (#eab308) | Solid yellow background, white text | Yellow border, dark yellow text, italic |

**Why these match the Training tab:** Consistency across the portal. Connor should not need to re-learn colour meanings when switching tabs. Blue for strength, green for cardio, and yellow for walking are established patterns from the Training tab.

**Scheduled vs completed:** The same visual distinction used in the Training tab. Completed sessions are filled (solid colour). Scheduled sessions are outlined (border only) with italic text. This gives Connor an instant visual read on what was done versus what was planned.

---

### Walking/Hiking Filter

**What it does:** The same walking filter from the Training tab applies here. Walking and hiking sessions only appear if they meet at least one threshold: distance over 3km, duration over 45 minutes, or max heart rate over 100bpm. Scheduled walking sessions are not shown at all since there is no data to filter on.

**Why:** Consistency with the Training tab. The reasoning is identical - casual walking clutters the calendar with noise and does not represent meaningful training.

---

### Body Stats Indicator

**What it does:** When a client logs body stats (weight, measurements, etc.) on a given day, a small grey dot appears in the top-right corner of that day's cell. There is no label - just a subtle visual indicator.

**How it works:** The Trainerize `/calendar/getList` response includes items with `type: 'bodystat'`. If any bodystat item exists for a day, the backend sets `bodyStatsLogged: true` for that day. The frontend renders a 7px grey (#555e62) dot.

**Why a dot and not a label:** The body stats indicator is a secondary piece of information. Connor is not reviewing body stats on the Calendar tab - he just wants to confirm the client weighed in. A dot is enough to answer "did they log something today?" without adding visual noise to cells that already contain activity pills.

---

### Day Overflow and Tooltip

**What it does:** Each day cell shows a maximum of two activity pills. If a day has more than two activities, the first two are shown with a "+X more" indicator below. Clicking a day with content opens a tooltip showing the full list of activities with additional detail (duration, distance) and the body stats indicator.

**Why two visible pills:** Calendar cells need to remain compact and readable. Showing all activities in a busy day would cause cells to expand unevenly and break the grid layout. Two pills plus a "+X more" indicator keeps cells uniform while signalling that more data exists.

**Why a tooltip instead of expanding:** Expanding a cell would push other rows down and disrupt the month grid layout. A floating tooltip preserves the grid structure and is a more natural interaction pattern for calendar views.

---

### Insufficient Tracking Visual Treatment

**What it does:** When a day's logged calories are below 65% of the client's daily calorie goal, the calorie and protein stats in that day's cell are shown at reduced opacity (40%). The tooltip for that day labels the calories as "Calories (partial)" and also mutes both values.

**Why:** This uses the same 65% threshold as the Nutrition tab's smart averaging logic. A day where the client logged only a snack or one meal does not give an accurate picture of their intake. Muting the numbers rather than hiding them lets Connor see that something was logged while making it visually clear that the data is incomplete. This prevents Connor from drawing conclusions from misleadingly low calorie numbers during a Loom recording.

**How it works:** The backend compares each day's total calories against the `goal.caloricGoal` from the Trainerize `/dailyNutrition/getList` response. If `calories < caloricGoal * 0.65`, the day is flagged as `insufficientTracking: true`. The frontend applies an opacity reduction to the calorie and protein stats. Weight and sleep are unaffected since they are independent of nutrition tracking.

---

### Fibre on the Overview Calendar Pill

**What it does:** Each day's red nutrition pill on the Overview calendar shows calories, protein (`Ng P`), and fibre (`Ng F`) side by side, so Connor can read a day's fibre without clicking into the day overlay. The overlay also lists a Fibre row. Fibre only renders when it is greater than 0.

**Why:** Fibre is a metric Connor reviews with clients (it has its own per-client target - see the Fibre Target section), and most clients under-eat it. Surfacing it on the pill removes a click during Loom reviews.

**How the pill fits both macros:** The nutrition pill (`.cal-panel__stat--nutrition`) is a `flex-wrap` container. Calories, protein, and fibre are separate segments, each kept intact on one line (`white-space: nowrap`), that wrap onto a second line inside the pill rather than truncating. This keeps the month grid uniform while showing the full values.

**Data source caveat:** The calendar reads nutrition via `store.getNutritionData` (Trainerize `/dailyNutrition/getList`). Fibre is served from the `client_nutrition.fibre` DB column, which is populated by the per-day `/dailyNutrition/get` detail sync (used by the Nutrition tab) - the `getList` payload itself does not reliably include fibre. In practice the daily reconciliation and Nutrition tab views keep `fibre` populated, so the calendar shows the same fibre value as the Nutrition tab. On a fully cold cache a live `getList` fetch may briefly show a day without fibre until detail data is synced.

---

## Coach's Corner - Direct Messages

### How DM Threads Work

**What it does:** The Messages section in Coach's Corner provides a full DM interface synced with the Trainerize messaging system. Connor can view all client conversations, send messages, and schedule messages for future delivery.

**How threads are fetched:** The backend calls `POST /message/getThreads` with `view: "inbox"` to get all threads. Each thread contains `ccUsers` (an array of user IDs in the conversation), `threadID`, `excerpt`, `lastSentTime`, and `totalUnreadMessages`. The backend matches `ccUsers[].userID` against the `trainerize_id` column in the `clients` table to resolve client names. Only threads that match a known client are shown.

**How messages are fetched:** For a selected thread, the backend calls `POST /message/getMessages` with the `threadID` to retrieve individual messages. Each message has a `sender` object with `type: "trainer"` or `type: "client"`, which determines alignment (right for Connor, left for client).

**How messages are sent:** If a thread already exists, the backend uses `POST /message/reply` with the `threadID` and `body`. If no thread exists for a client, it uses `POST /message/send` with `recipients: [trainerize_id]`, `threadType: "mainThread"`, `conversationType: "single"`, `type: "text"`. The `/message/send` response returns the new `threadID`.

---

### Scheduled Message Persistence

**What it does:** When Connor schedules a message, it is immediately saved to the `scheduled_messages` database table with `status: 'pending'`. The message is never held in memory or in a queue - it lives in PostgreSQL from the moment Connor confirms the schedule.

**Why:** If the server crashes or restarts, all scheduled messages are preserved because they exist in the database. On the next server start, the scheduler picks them up and sends them at the correct time.

**Table structure:** `scheduled_messages` has columns: `id`, `coach_id`, `client_id`, `body`, `send_at` (TIMESTAMPTZ), `status` (pending/sent/failed), `trainerize_thread_id` (nullable), `file_token` (nullable), `file_name` (nullable), `created_at`.

---

### UTC/Dublin Timezone Handling

**What it does:** All scheduled times are stored in the database as UTC (PostgreSQL TIMESTAMPTZ handles this natively). When Connor picks a time in the scheduler UI, the frontend converts Dublin local time to UTC before sending it to the backend. When displaying scheduled times back to Connor, the frontend converts from UTC to Europe/Dublin using `Intl.DateTimeFormat` with `timeZone: 'Europe/Dublin'`. Every scheduled time in the UI is labelled with "(Dublin time)" to prevent ambiguity.

**Why UTC storage:** PostgreSQL TIMESTAMPTZ stores all timestamps in UTC internally. The scheduler compares `send_at <= now()` where `now()` is also UTC. This means the comparison is always correct regardless of server timezone, DST changes, or deployment location. Dublin observes GMT in winter and IST (GMT+1) in summer. By storing UTC and converting on display, the system automatically handles the clock change without any manual adjustment.

**How the conversion works:** The frontend uses a reliable two-step method: (1) Parse the user's date/time input as if it were UTC. (2) Calculate the Dublin offset at that date/time using `Intl.DateTimeFormat`. (3) Subtract the offset to get the true UTC instant. This correctly handles DST transitions because the offset calculation uses the target date, not the current date.

---

### File Attachments - Trainerize Group Posts

**Discovered behaviour (undocumented in Trainerize API docs):** `POST /file/upload` with `attachType: "messageAttachment"` and `attachTo: threadID` in the `data` field is a single-step process. It uploads the file AND creates a message with the attachment in the thread simultaneously. The response returns `{ id, messageID }` where `messageID` is the auto-created message containing the attachment. Sending `data: {}` (empty) returns 406 "Invalid data." The `attachType` field is an enum - `"messageAttachment"` is the correct value for message attachments. Other tested values: `0`-`4` return "Invalid attach type", `3` returns 403, `5` works but returns no `messageID`.

**Why not fileToken:** The Trainerize API documentation lists `fileToken` as a response field on message objects (for reading attachments), but it is not a valid request parameter for `/message/reply` or `/message/send`. Passing `fileToken` in a reply payload is silently ignored - the text arrives but the attachment does not. The only working method for attaching files is via `/file/upload` with `attachType: "messageAttachment"`.

**Implementation pattern:**

1. **Frontend holds the File object in React state** - no pre-upload on file select. The file preview (name, size, remove button) shows immediately in the compose area. Previously the frontend attempted an async upload on file select, which always failed with 406 and cleared the file from state, making it appear to vanish.

2. **On "Post Now":** The file is sent as multipart `FormData` (with `file`, `groupThreadId`, and `body` fields) to `POST /api/messages/post`. The backend uploads to Trainerize using `attachType: "messageAttachment"` and `attachTo: threadID`, which creates the attachment message. Then the text body is sent as a separate `POST /message/reply`. The attachment appears first in the thread, followed by the text.

3. **For scheduled posts:** The file binary is stored as `BYTEA` in the `scheduled_posts` table (`file_data`, `file_content_type`, `file_name` columns) at schedule time. When the scheduler fires, it uploads the file via the same `/file/upload` method with `messageAttachment`, then sends the text body as a reply. This ensures the file survives server restarts between schedule and send time.

**Media rendering in threads:** The `POST /message/get` response includes an `attachment` object with `fileToken`, `contentType`, `fileName`, and `fileSize`. The frontend renders attachments based on `contentType`: images are shown as thumbnails (click to expand), videos are shown with an inline player, and PDFs/other files are shown as download links with filename and size.

---

## Coach's Corner - Scheduled Posts

### How Group Posts Work via threadID

**What it does:** Group posts in Trainerize are actually messages sent to a group's message thread. Each user group has a `threadID` returned by `POST /userGroup/getList`. To post to a group feed, the backend calls `POST /message/reply` with the group's `threadID` and the post body. This is the same reply endpoint used for DM threads - the only difference is the `threadID` belongs to a group rather than a 1-on-1 conversation.

**How groups are fetched:** The backend calls `POST /userGroup/getList` with `view: "mine"` to get all groups Connor belongs to. Each group returns `id`, `name`, `threadID`, and `type`. The `threadID` is the key field - it is what connects a group to its message feed.

**Why message/reply and not message/send:** The group thread already exists (created when the group was set up in Trainerize). Posting to it is a reply to that thread, not starting a new conversation. Using `message/reply` with the group's `threadID` appends the post to the group feed exactly as if Connor had typed it in the Trainerize app.

---

### Line-Ending Normalization on Send

**What it does:** Just before a scheduled post (or scheduled DM) is sent to Trainerize, the message body is run through a `normalizeBody()` helper in `backend/lib/scheduler.js`. This helper converts Windows line endings to plain line feeds, strips trailing spaces on each line, and caps consecutive blank lines so paragraph spacing is at most one blank line.

**The problem it fixes:** Posts composed or pasted from Word, Outlook, Apple Notes, or email carry Windows-style `\r\n` (carriage-return + line-feed) line endings, and some carried a `\r\n \r\n` pattern (a "blank" line containing a single space) between paragraphs. Trainerize's message renderer counts the `\r` and the `\n` as two separate line breaks, so every single line break arrived doubled and every paragraph gap arrived tripled or worse. The result was posts with huge vertical gaps between sentences in the Trainerize group feed.

**Why it was hard to spot:** The portal's own scheduled-post preview renders the body inside a `<p>` element with the browser default `white-space: normal`, which collapses all runs of whitespace (spaces, `\r`, `\n`) down to a single space. So in the portal the spacing always looked correct - the extra line breaks were only visible once Trainerize rendered the raw text. The raw stored bytes confirmed the `\r\n` and `\r\n \r\n` patterns.

**What the helper does, in order:**
1. `\r\n` to `\n` - collapses Windows CRLF to a single line feed (this is what removes the doubling).
2. lone `\r` to `\n` - catches any stray carriage returns.
3. trailing spaces/tabs before a newline are stripped - handles the `\n \n` variant where a "blank" line held a space.
4. three or more consecutive newlines are capped at two - one blank line maximum between paragraphs.

**Why on send, not on store:** The normalization runs at send time only. The stored `body` in the `scheduled_posts` and `scheduled_messages` tables is never rewritten, so existing scheduled content is never modified or at risk of being mangled or deleted. Every pending item - already-scheduled and future - automatically passes through the same fix when the scheduler fires, with no migration or bulk edit needed.

**Where it applies:** Group posts (`processScheduledPosts`) and scheduled DMs (`processScheduledMessages`, both the thread-reply and new-conversation paths). Reminder DMs use clean hardcoded text and do not need it.

---

### Scheduled Post Persistence

**What it does:** Identical to scheduled messages - when Connor schedules a group post, it is immediately saved to the `scheduled_posts` table with `status: 'pending'`. The post is never held in memory.

**Table structure:** `scheduled_posts` has columns: `id`, `coach_id`, `group_id`, `group_thread_id`, `body`, `file_token` (nullable), `file_name` (nullable), `send_at` (TIMESTAMPTZ), `status` (pending/sent/failed/cancelled), `cancelled_at` (nullable), `sent_at` (nullable), `created_at`.

---

### Soft Delete and Recovery Mechanism

**What it does:** When Connor deletes a scheduled post, the post is never hard deleted. Instead, its status is set to `cancelled` and `cancelled_at` is recorded. The post remains in the database and appears in a collapsible "Cancelled" section in the UI. Connor can restore any cancelled post back to `pending` status, with the option to adjust the scheduled time before confirming.

**Why soft delete:** Accidental deletion is a real risk when managing multiple scheduled posts. Hard deleting a post means it is gone forever. Soft delete ensures nothing is ever truly lost. Connor can always go back and recover a post he cancelled by mistake, or reuse a cancelled post's content by restoring and rescheduling it.

**How restore works:** The `PUT /api/messages/posts/cancelled/:id/restore` endpoint sets `status` back to `pending` and clears `cancelled_at`. If a new `sendAt` is provided, it updates the scheduled time. The original scheduled time is pre-filled in the restore UI so Connor can accept it as-is or adjust it.

---

### Batch Scheduling Flow

**What it does:** Connor can queue up multiple posts in one session before saving any of them. When he clicks "Batch Schedule", the compose area stays open with the same group pre-selected after each post is added. A running list of "Posts queued this session" is visible below the compose area. When Connor is satisfied, one "Confirm all" button saves all queued posts to the database in a single API call.

**Why batch scheduling:** Connor often prepares a week's worth of group posts in one sitting. Without batch mode, he would need to compose, schedule, wait for confirmation, and repeat for each post. Batch mode lets him flow through all posts without interruption, review the full list, and save them all at once.

**How it works:** The batch queue is held in React state (not in the database). Posts are only persisted when Connor clicks "Confirm all", which calls `POST /api/messages/post/schedule/batch` with an array of posts. The backend inserts all of them in sequence. If any individual insert fails, the others still succeed.

---

### Background Scheduler

**What it does:** A single background job runs every 60 seconds using `setInterval`. Each tick, it checks both the `scheduled_messages` and `scheduled_posts` tables for rows where `send_at <= now()` and `status = 'pending'`. For each match, it sends the message or post via the Trainerize API and updates the status to `sent` (with `sent_at = now()` for posts). If a send fails, the status is set to `failed`.

**Scheduler failure handling:** Failed sends are never silently dropped. The status is set to `failed` and the post/message remains visible in the UI with a red "Failed" indicator and a "Retry" button. Connor can click Retry to re-queue the item as `pending` with `send_at = now()`, which means the scheduler will pick it up on the next tick. Failed items are also included in the scheduled posts list (alongside pending ones) so Connor always knows the state of every item.

**Why one scheduler for both:** Both scheduled messages and scheduled posts follow the same pattern: persist to DB, wait for the right time, send via Trainerize API, update status. Running a single scheduler that processes both tables in sequence is simpler and avoids duplicate timer logic. The scheduler processes up to 10 items per table per tick to avoid overwhelming the Trainerize API.

**Why setInterval and not node-cron:** The project does not have node-cron installed as a dependency. A simple `setInterval` at 60-second intervals achieves the same result for a single-user portal with low volume. There is no need for complex cron expressions when the only requirement is "check every minute."

**Startup behaviour:** The scheduler starts when the Express server starts (`app.listen` callback). It runs an initial check 5 seconds after boot to catch any messages that became due while the server was down, then continues on the 60-second interval.

---

## Check-in Deadline Reminders

### Weekly Reminder (My Fit Coach Clients)

**What it does:** Every Monday at 8:30pm Dublin time, the scheduler checks which My Fit Coach clients have not submitted a weekly check-in for the current cycle. For each client who has not submitted, a DM is sent via Trainerize with a link to the weekly check-in form.

**Message sent:** "Hey [first name], just a reminder to fill out your weekly check-in when you get a chance. Here's the link: https://mfctransformations.typeform.com/checkingin"

**How it works:** The scheduler's `processReminders()` function runs every 60 seconds alongside `processScheduledMessages()` and `processScheduledPosts()`. On each tick, it checks the current Dublin time using `Intl.DateTimeFormat` with `timeZone: 'Europe/Dublin'`. If it is Monday and the time is 8:30pm or later, it checks the `reminder_logs` table to see if reminders have already been sent for this cycle (identified by `cycle_start` = most recent Sunday). If no logs exist, it queries active clients with `program = 'my_fit_coach'` who have no check-in row in the `checkins` table for this cycle, and sends each one a DM via `POST /message/send`.

**Why Dublin time:** Ireland observes GMT in winter and IST (GMT+1) in summer. Using `Intl.DateTimeFormat` with `timeZone: 'Europe/Dublin'` automatically handles DST transitions. This is the same timezone pattern used for scheduled message display throughout the portal.

---

### Monthly EOM Reminder (My Fit Coach Core Clients)

**What it does:** The End of Month report opens on the last Saturday of the month. The deadline is the following Monday. At 7:00pm Dublin time on that Monday, the scheduler checks which Core clients have not submitted an EOM report for the current cycle and sends each one a reminder DM.

**Message sent:** "Hey [first name], just a reminder to fill out your end of month report when you get a chance. Here's the link: https://form.typeform.com/to/iISVFuRv"

**EOM deadline Monday calculation:** The `getEomDeadlineMonday(year, month)` function in `cycle.js` calculates the correct Monday dynamically:
1. Find the last day of the given month
2. Walk backward to find the last Saturday (day of week = 6)
3. Add 2 days to get Monday

This Monday may fall in the next month. For example, if the last Saturday of February is the 28th, the deadline Monday is March 2nd. The scheduler handles this by checking both the current month and the previous month on each tick - if today is the EOM deadline Monday for either month, it processes reminders for the corresponding cycle.

**Cycle start:** The `cycle_start` for EOM reminders is the 1st of the month whose last Saturday triggered the deadline. So even if the deadline Monday falls in March, the `cycle_start` is February 1st if the last Saturday was in February.

---

### Deduplication via reminder_logs

**What it does:** The `reminder_logs` table prevents the same reminder from being sent twice. Each row records one reminder attempt with a UNIQUE constraint on `(coach_id, client_id, reminder_type, cycle_start)`.

**How it works:** Before processing reminders for a cycle, the scheduler checks if any `reminder_logs` rows exist for that `(reminder_type, cycle_start)` combination. If rows exist, the cycle has already been processed and no further action is taken. When sending each individual reminder, the row is inserted with `ON CONFLICT DO NOTHING` as a safety net against race conditions.

**Why this approach:** The scheduler runs every 60 seconds. On a Monday evening after 8:30pm, every tick would see "it is Monday after 8:30pm" and attempt to send reminders. The `reminder_logs` check on the first tick processes all reminders and inserts logs. Every subsequent tick sees existing logs and skips immediately. This is simpler and more reliable than trying to track "did we already run this tick" in memory, which would not survive a server restart.

**Logging columns:**
- `sent: true` - the DM was successfully sent via Trainerize
- `sent: false, skipped_reason: 'reminders_disabled'` - reminders are turned off in settings
- `sent: false, skipped_reason: 'no_trainerize_id'` - client has no Trainerize ID
- `sent: false, skipped_reason: 'send_failed: ...'` - the Trainerize API call failed

---

### Reminder Logic Hierarchy

Reminders are controlled by a three-level hierarchy. All three levels must be enabled for a reminder to be sent:

1. **Global toggle** (`coach_settings.reminders_enabled`) - master switch for all reminders. If off, nothing is sent.
2. **Program-level toggle** (`coach_settings.mfc_reminders_enabled` / `coach_settings.core_reminders_enabled`) - controls reminders per program type. "My Fit Coach weekly reminders" controls Monday 8:30pm reminders for all MFC clients. "My Fit Coach Core monthly reminders" controls EOM Monday 7pm reminders for all Core clients.
3. **Per-client toggle** (`clients.reminders_enabled`) - controls reminders for an individual client. Visible as a toggle switch directly on each client row in the Client Manager. When off, that client is skipped regardless of global and program settings.

**How the scheduler checks:** For weekly reminders, the scheduler evaluates `global AND mfc AND client.reminders_enabled`. For EOM reminders, it evaluates `global AND core AND client.reminders_enabled`. If any level is false, the reminder is logged as skipped with `skipped_reason: 'reminders_disabled'`.

**Why three levels:** Connor sometimes needs to pause all reminders (global), pause reminders for an entire program (program-level, e.g. during a holiday week for MFC clients only), or pause reminders for a specific client (per-client, e.g. a client who is on holiday or taking a break). The three levels give him precise control without needing to remember which clients he manually disabled.

**Per-client toggle location:** The toggle sits directly on each client row in the Client Manager, in its own "Reminders" column between Status and Actions. It is teal when on, grey when off. This makes it visible at a glance without opening the edit modal.

**API:** `GET /api/settings` returns `{ remindersEnabled, mfcRemindersEnabled, coreRemindersEnabled }`. `PUT /api/settings` accepts any combination of these booleans. `PATCH /api/clients/:id/toggle-reminders` with `{ remindersEnabled: true/false }` toggles the per-client setting.

---

### Server Downtime

**What happens if the server is down during the reminder window:** If the server restarts while it is still Monday after 8:30pm Dublin time, the startup check (5-second delay) will trigger `processReminders()`, which will see no `reminder_logs` for this cycle and send the reminders. If the server is down for the entire Monday evening and comes back on Tuesday, the "is it Monday?" check will fail and reminders for that week are skipped. This is acceptable for a single-coach portal with low volume.

---

## Client Sync

### Automatic Add via Webhook

**What it does:** When a client is created in Trainerize, Trainerize fires a `client.added` webhook to `POST /webhooks/trainerize`. The `handleClientAdded` handler inserts the client into the `clients` table with `pending_setup = true`, `program = NULL`, `active = true`, and `trainerize_joined_at = now()`. The program is filled in later by the `userTag.addedToUser` webhook when Connor tags the client "Connor - MyFitCoach" or "Connor - Core MyFitCoach".

**The gap this leaves:** The `client.added` webhook is fire-once and real-time. Trainerize does not retry it indefinitely. If the portal is down, mid-deploy, or the event is otherwise missed at the moment the client is created, that client is never added - there is nothing that re-checks Trainerize afterward. This actually happened: a client (Alan Flannery) was active in Trainerize for over two weeks but never appeared in the portal, because his `client.added` event was never processed and no row (not even a `pending_setup` stub) was ever created for him.

---

### Daily Reconciliation (Safety Net)

**What it does:** Once per day, the scheduler pulls the full list of active clients from Trainerize and inserts anyone who is missing from the portal. This guarantees that a dropped `client.added` webhook can never again leave a paying client off the dashboard.

**How it works:** `reconcileClients()` in `backend/lib/scheduler.js`:
1. Fetches all active clients via `POST /user/getClientList` (`view: 'activeClient'`, paginated).
2. Resolves the two program tags via `POST /userTag/getList` and builds a map of Trainerize userID to program, exactly as the one-time import script does.
3. For each active client: if a row already exists by `trainerize_id`, it is skipped. If a row exists by email but has no `trainerize_id` (e.g. a webhook row whose userID lookup failed), it is linked rather than duplicated. Otherwise the client is inserted with `pending_setup = true` and the program from their tag (or NULL if untagged).

**Safety guard:** If Trainerize returns an empty client list (almost always an API hiccup rather than a genuine zero), the run is skipped so the portal never acts on bad data.

**Scheduling:** The job is gated to run at most once per Dublin calendar day, after 06:00. The "last run" day is tracked in memory. On a server restart it simply runs once more that day - this is harmless because the job is idempotent (it only inserts clients that are missing), and it doubles as a catch-up after any downtime. This matches the portal's existing "single coach, low volume, in-memory tracking is acceptable" philosophy used for reminders.

**What it does not do:** Reconciliation only creates the client record. It does not backfill historical Trainerize data - that remains a separate manual step (`backend/db/backfill-trainerize.js`). A reconciled client starts populating data through the normal on-demand store layer and webhooks from the moment they are added.

---

## Overview Check-in Panel - Program-Aware Check-in Type

**What it does:** The check-in panel on a client's Overview tab shows their most recent check-in (latest first, with navigation to older ones). Which check-in type it pulls now depends on the client's program:

- **My Fit Coach** clients - their **weekly** check-ins.
- **My Fit Coach Core** clients - their **End of Month report**.

**The problem it fixes:** The panel previously queried `type = 'weekly'` only. Core clients do not submit weekly check-ins - they submit EOM reports - so their latest EOM never appeared, and the panel showed a stale weekly check-in from months earlier (or nothing). Carlo Salizzo submitted a June EOM report that was correctly stored and showed in the Check-in Hub, but his Overview kept showing a weekly check-in from March because of this filter.

**How it works:** `client-overview.js` `/summary` derives `checkinType` from `client.program` (`my_fit_coach_core` to `eom_report`, otherwise `weekly`) and uses it to fetch both the latest check-in and the trend. The EOM Typeform uses readable field refs (`eom-training-rating`, `eom-days-on-plan`, `eom-progress-direction`, etc.) that map onto the same seven score categories, days-on-plan, and progress-direction as the weekly form. So `parseScores` and `parseFormAnswers` in `overview-parsers.js` were extended to recognise both ref styles and produce one identical shape - the existing score blocks, weighted total out of 45, and trend all work unchanged for EOM reports.

**EOM-only fields:** The EOM report has two fields with no weekly equivalent - "Confidence in direction" (a 1-10 rating surfaced as text, e.g. "7/10") and "In hindsight". These render as follow-up fields in the panel, so they appear for EOM reports and stay hidden for weekly check-ins (where they are null). The panel header labels the check-in type ("End of Month report" vs "Weekly check-in") so the coach always knows which form they are reading.

---

## Recovery Tab (Future Build)

### Available Trainerize API Data

The following Trainerize API endpoints return data relevant to the Recovery tab. These are confirmed working and available for use when the tab is built.

**Resting heart rate:** `POST /healthData/getList` with `type: 'restingHeartRate'` in the request body. Returns daily resting heart rate readings. This data comes from the client's connected wearable (e.g. Apple Watch, Fitbit) or manual entries in Trainerize.

**Body composition:** `POST /bodystats/get` returns body fat percentage and body measurements (waist, chest, hips, etc.) logged by the client. This uses the same Trainerize auth pattern as all other API calls in the portal.

**No code changes needed now.** These endpoints are documented here so they are ready to use when the Recovery tab build begins. Both follow the existing Trainerize auth pattern in `backend/lib/trainerize.js`.

---

## Weight Trajectory Overlay

The weight trajectory chart on the Overview tab supports a phase overlay that projects target weight bands onto the graph. This is completely independent of the client header phase field (`clients.current_phase`) - a coach can set a trajectory overlay without changing the client's header phase, and vice versa.

### Why independent?

The header phase badge is a quick-glance label for the coach. The trajectory overlay is a detailed projection tool with dates, rates, and bands. They serve different purposes and change at different times. Coupling them would force the coach to update both whenever either changes.

### Storage

Settings are stored in the `weight_trajectory_settings` table (one row per client, UPSERT pattern). Fields: `phase_type`, `start_date`, `end_date`, `min_rate`, `max_rate` (for rate-based phases), `lower_band`, `upper_band` (for fixed-band phases).

### Phase types and what they show

**Fat Loss** - Two diagonal lines projecting downward from the start weight at `min_rate` and `max_rate` kg per week. The area between them is shaded in subtle red/pink. The start weight is derived from the first weight entry on or after `start_date` - it is not stored in settings, so the overlay always reflects actual data.

**Building** - Same as Fat Loss but projecting upward. Shaded in subtle green.

**Recomp and Maintenance** - Two flat horizontal lines at `lower_band` and `upper_band` kg values. These are absolute weight values, not rates. Shaded in subtle teal.

### Rendering rules

- The overlay only renders between `start_date` and `end_date`. Outside that range, no band is shown.
- If `end_date` is null, the overlay extends to the end of available data.
- The client's actual weight line always renders on top of the overlay.
- The time range toggle (1 Month / 3 Months / 6 Months / 1 Year) still works - the overlay adjusts to the visible date range because band data is computed per weight entry.
- A legend below the chart shows the phase type, date range, and rate/band values in plain text.

### Settings panel

The settings panel opens inline below the Weight Trajectory section header (not a modal). It slides open when the gear icon is clicked. If no settings are saved, the gear icon shows a small amber dot indicator. The Clear button removes the overlay entirely (hard delete - this is a settings record, not user content).

---

## Trainerize API Performance

### Shared helper

All Trainerize API calls go through a single shared module at `backend/lib/trainerize.js`. This provides:

- **Authentication:** Basic auth using `TRAINERIZE_GROUP_ID` and `TRAINERIZE_API_TOKEN` from environment variables.
- **Two call modes:** `trainerizePost` (cached, returns `{ data, timedOut }`) for read operations, and `trainerizePostRaw` (throws on error, no cache) for write operations (messaging, file uploads, scheduled sends).
- **File uploads:** `trainerizeUploadFile` handles FormData uploads to `/file/upload`.

### Timeout and retry

Every Trainerize API call has an **8-second timeout**. If a call times out or fails:

1. Wait 3 seconds, then retry once automatically.
2. If the retry also fails, return `null` for that data section.
3. The failed endpoint is tracked and included in the API response as `timedOutSections` - an array of human-readable section names (e.g. `["sleep", "weight"]`).
4. The frontend can use `timedOutSections` to show a "tap to retry" indicator on just the affected section instead of showing it as silently empty.

**Why:** Trainerize's API occasionally has slow responses. Without a timeout, a single stuck call blocks the entire page load. The retry catches transient failures. Returning partial data with clear flags means Connor always sees what loaded and what did not.

### In-memory caching

A simple in-memory `Map` caches Trainerize API responses. No Redis needed - this is a single-coach tool with one user.

**Cache key format:** `clientId:endpoint:bodyJSON`

Where `clientId` is the Trainerize `userID`, `endpoint` is the API path (e.g. `/calendar/getList`), and `bodyJSON` is the full JSON-stringified request body. This means different date ranges or different clients always get separate cache entries.

**TTL rules:**

- **Historical data** (any request where the end date falls before the current Monday) - cached for **1 hour**. Yesterday's sleep, last week's steps, and historical body stats do not change.
- **Current week data** (any request where the end date is the current week or later) - cached for **5 minutes**. This keeps the data reasonably fresh during a live review call.

**How "historical" is determined:** The helper checks the request body for `endDate` or `endTime` fields. If the end date falls before the current Monday in Europe/Dublin timezone, the data is considered historical.

### Cache invalidation

When a Trainerize webhook fires for a client (workout completed, body stats logged, cardio completed, status changed, add-on connected), **all cache entries for that client's Trainerize userID are cleared immediately**. This ensures the portal always shows fresh data when the client has just done something.

The events that trigger invalidation: `dailyWorkout.completed`, `dailyCardio.completed`, `bodystats.completed`, `client.statusChanged`, `addOn.mfp.connected`, `addOn.fitbit.connected`.

### Prefetching

When Connor selects a client from the Check-in Hub, the frontend immediately fires a background POST to `/api/clients/:id/prefetch`. This endpoint:

1. Looks up the client's Trainerize ID.
2. Fires all Overview tab Trainerize calls in parallel (calendar, nutrition, steps, sleep, resting heart rate).
3. Returns `{ ok: true }` immediately without waiting for the calls to complete.

The calls populate the cache in the background. By the time Connor navigates to the Overview tab (which happens almost instantly after selection), the data is already cached and the tab loads from cache instead of making fresh API calls.

**Why this works:** The Check-in Hub selection triggers a client detail fetch which takes ~200ms. During that time, the prefetch fires 5 parallel Trainerize calls. Even if the Trainerize calls take 2-3 seconds, they complete before Connor starts reading the Overview data.

### Cache lifecycle

The in-memory cache lives in process memory and acts as a fast L1 layer. It is backed by persistent PostgreSQL storage (see below).

---

## Persistent Trainerize Data Storage

### Problem

The in-memory cache is lost on server restart. Historical data that never changes (last week's sleep, last month's workouts) was being re-fetched from Trainerize on every restart and on every first page load.

### Solution

All Trainerize data is now stored permanently in PostgreSQL. The data layer (`backend/lib/trainerize-store.js`) checks the database first and only calls Trainerize when data is missing or stale.

### Database tables

| Table | Content | Unique key |
|-------|---------|------------|
| `client_body_stats` | Weight, body fat, measurements per date | client_id + date |
| `client_sleep` | Sleep segments per night | client_id + date + start_time |
| `client_health_data` | Steps, resting heart rate per date | client_id + date + type |
| `client_nutrition` | Calories, macros, goals per date | client_id + date |
| `client_workouts` | Strength sessions with full detail JSON | client_id + trainerize_id |
| `client_cardio` | Cardio sessions with duration/distance/HR | client_id + trainerize_id |
| `backfill_progress` | Tracks backfill script resume state | client_id + data_type |

### Fetch strategy

When any backend route needs Trainerize data for a client:

1. **Check the database first** for the requested client + date range.
2. **If the data exists and the date is before the current Monday** - use it from the database. Never call Trainerize again for that data. Historical data does not change.
3. **If the data exists and the date is within the current week** - use it only if it was fetched within the last 5 minutes. This keeps data fresh during live review calls.
4. **If the data does not exist** - fetch from Trainerize, store it in the database, then return it.

### Webhook-driven updates

When a client logs a body stat, completes a workout, or completes a cardio session, the corresponding Trainerize webhook fires and immediately upserts the data into the database:

- `bodystats.completed` - fetches full body stats via API (webhook only has partial data) and stores in `client_body_stats`
- `dailyWorkout.completed` - fetches full workout detail and stores in `client_workouts` with `detail_json`
- `dailyCardio.completed` - fetches full cardio detail and stores in `client_cardio` with duration/distance/HR

This means the database stays up to date in real time without waiting for the next page load.

### Backfill script

`backend/db/backfill-trainerize.js` fetches 12 months of historical data for all clients. Features:

- Processes 5 clients in parallel, all data types within each client in parallel
- Rate limiting: stays under 900 requests/minute (Trainerize limit is 1000)
- Retry with exponential backoff: 3s, 6s, 12s delays on failure
- Resume capability: tracks progress in `backfill_progress` table, skips completed work on re-run
- Real-time progress logging per client per data type

### Two-layer cache architecture

1. **L1 (in-memory)**: Fast, 5-minute TTL for current week, 1-hour TTL for historical. Lost on restart.
2. **L2 (PostgreSQL)**: Permanent. Historical data never expires. Current week data refreshed every 5 minutes.

On a cold start after restart, the first page load reads from PostgreSQL (fast, ~10ms) instead of calling Trainerize (slow, ~1-2s). The in-memory cache warms naturally from these DB reads.

## MyFitCoach Forms (forms.myfitcoach.ie) - self-hosted Typeform replacement

Added July 2026. Standalone Express service in `forms/`, replacing the Typeform weekly check-in (Phase 1). Shares the Railway Postgres database with the portal but has zero code dependency on it - if the portal is ever retired (e.g. a move away from Trainerize), MyFitCoach Forms keeps running unchanged.

### Data compatibility with Typeform history

- Submissions are written to the existing `checkins` table with `form_data` in the exact Typeform answers-array shape, using the original Typeform field refs from `connor-weekly-checkin-reference.md`.
- The portal's `overview-parsers.js` therefore reads new submissions identically to the 1,000+ historical Typeform rows - scores, trends, and Check-in Hub need no changes.
- `typeform_response_id` for new submissions is `mfc_<uuid>` (the `mfc_` prefix distinguishes source). The column's unique index provides submit idempotency: client retries reuse the same UUID and can never create duplicates.
- The client is identified by their personal link token (`form_links` table, one permanent token per client), not by typing their name - eliminates the fuzzy-match failure mode where webhook submissions were silently skipped.

### Reliability model

- Every answer autosaves to `form_drafts` (one draft per client per form type per cycle, upserted). A client interrupted mid-form resumes with all answers intact on any device opening their link.
- `visibilitychange` + `sendBeacon` flushes unsaved answers when the phone locks or the tab closes.
- The thank-you screen only shows after the server confirms the insert; the client sees retry UI on failure, and answers remain in the draft either way.
- Drafts are deleted on successful submit. Stale conditional follow-up answers (e.g. client raised a low score back above the threshold) are excluded from `form_data` at submit time by re-evaluating trigger conditions server-side.
- Cycle assignment mirrors the webhook exactly: `cycle_start` = most recent Sunday (UTC), copied into `forms/lib/cycle.js`. If the portal's cycle rules change, change both copies.

### Conditional follow-up thresholds

- Scale questions Q2, Q3, Q4, Q6, Q7: follow-up shown when the answer is 5 or below.
- Q4 nutrition additionally asks "information issue or execution issue" (stored as text, matching how the portal parses it).
- Q8 stress is inverted: follow-up shown when the answer is 6 or above.

### Admin area

- `/admin` on MyFitCoach Forms - password login (`FORMS_ADMIN_PASSWORD` in .env), stateless HMAC session cookie (`FORMS_SESSION_SECRET`), 30-day expiry.
- Lists all check-ins (Typeform-era and new), per-client and per-type filters, full answer detail, CSV export with one column per question.
- All times displayed in Europe/Dublin and labelled "(Dublin time)". `cycle_start` DATE columns are formatted with local getters - pg returns them as local-midnight Dates, and UTC getters shift the day during Irish summer time.

### Deployment

- Runs as a separate Railway service (`node forms/server.js`, port from `FORMS_PORT`, default 3002), same repo, same `DATABASE_URL`. Deployment is manual per project rules.
- DNS: CNAME `forms.myfitcoach.ie` to the Railway service domain.
- `forms/db/migrate.js` creates `form_links` and `form_drafts` (additive only). `forms/db/generate-links.js` mints tokens for active clients missing one; safe to re-run, never rotates existing tokens.

### Weekly check-in end screens and navigation (July 2026)

- After submit, the client sees a score-based end screen mirroring the old Typeform outcome screens: an SVG gauge (five bands) with the needle on their band, plus per-band messages. Brackets: 10-16 Critical, 17-23 Underperforming, 24-30 Stable, 31-37 High Performance, 38-45 Peak Performance. Defined in `forms/lib/checkin-definition.js` (END_SCREENS) - same brackets as SCORE_BANDS, keep in sync.
- The band is chosen server-side in the submit response, never trusted from the client.
- Form navigation: ArrowUp = previous question, ArrowDown = next (blocked with a shake if a scored question is unanswered; free-text and the multi-select are skippable). Swipe up/down does the same on touch devices, except over the scrollable multi-select list and text inputs. Enter advances on text questions (Shift+Enter for a new line).

### End of Month report on MyFitCoach Forms (July 2026)

- The EOM report runs on the same engine as the weekly check-in at `/monthly/<token>` (same personal token per client). Definition in `forms/lib/eom-definition.js`, built from `connor-eom-report-reference.md`: training first / overall last, explicit follow-up thresholds (low = 6 or below, stress = 7 or above), multiple-choice follow-ups, unscored direction confidence, hindsight question. Cycle = the month the report is for (see "End of Month reports are filed under the month they are for"), checkins.type = 'eom_report'.
- EOM scoring brackets differ from weekly (training bracket, stress position 6 scores 4 not 3). Verified against Typeform's own calculated scores: 18/20 historical EOM responses match exactly; the two non-matching are the earliest (mid-March 2026), where Typeform recorded score 0 because its scoring variable was not yet configured.
- FIXED July 2026: backend/lib/overview-parsers.js now detects EOM submissions by their eom-* refs and applies WEIGHT_BRACKETS_EOM (training and stress differ from weekly). Verified: all 20 EOM rows agree with the Typeform-verified engine; weekly scoring unchanged (100/100 sample). Takes effect on the portal's next manual deploy.

### Onboarding form with Trainerize sync (July 2026)

- Public form at forms.myfitcoach.ie/join (no client token - Connor emails the link). Definition in `forms/lib/onboarding-definition.js`, pulled field-for-field from the live Typeform "Connor 2026 - MyFitCoach Onboarding Form" (H4Y0MeYY): 36 visible questions plus 3 conditionals (gym name when Commercial gym selected, equipment list when Home gym selected, allergy detail when Other selected). Required flags mirror the Typeform.
- Drafts autosave keyed by an anonymous UUID in the browser's localStorage (onboarding_drafts table); the UUID is cleared after successful submit so the next person on the same device starts fresh.
- Submit pipeline, in order: (1) store answers in onboarding_submissions - never lost from this point; (2) create the client in Trainerize via /user/add with sendMail: true, so Trainerize emails the sign-in invite itself (no separate email service); (3) create the portal clients row (program defaults to my_fit_coach) and mint their personal form_links token so check-in links exist from day one; (4) mark synced. Any Trainerize failure marks sync_failed with the error - the client still sees the success screen, and the admin area (Onboarding tab) shows the failure with a one-click retry.
- Auto-sync on submit is deliberate (Connor's call): the link is only given to real new clients; a stray submission is deleted manually.
- forms/lib/trainerize.js is the only file in MyFitCoach Forms that knows Trainerize exists - swap this connector if the coaching platform ever changes.
- Verified end to end against the live Trainerize API with a test client (created, synced, then deleted via /user/delete). Trainerize duplicate email returns a 406 which surfaces as a retryable sync failure.

### Onboarding welcome message (September 2026)

**What it does:** As soon as an onboarding submission syncs, MyFitCoach Forms sends the new client Connor's welcome DM in Trainerize (weigh in tomorrow morning, starting photos, connect smart tech, start-up email within 24 hours). The wording lives in `forms/lib/welcome-message.js`; the only variable is the first name. The send itself is `sendMessage()` in `forms/lib/trainerize.js`, the same `/message/send` payload the Coach Portal's reminders use (`mainThread`, `single`, `text`).

**Why it moved off Zapier:** Zapier sent this as part of the Typeform onboarding Zap, 10 minutes after the Trainerize client was created (checked against Cian Mcloughlin and Gary Corley in Aug 2026). Clients joining through `/join` never passed through that Zap, so they would have received nothing. It was also unreliable: Brian Thompson (17 Aug 2026) never received it. Keeping it inside MyFitCoach Forms means sign-ups do not depend on Zapier or on the Coach Portal.

**Sent immediately, not after 10 minutes:** A delay would need a background timer in MyFitCoach Forms, which has none, and a restart mid-wait would lose it. A message sent before the client installs the app waits in their inbox, so it is the first thing they see either way.

**Never twice:** `onboarding_submissions.welcome_sent_at` is set only after Trainerize accepts the message, and `sendWelcome()` refuses any submission that already has one. An in-process guard stops two overlapping calls for the same submission (a double-clicked send button) both getting past that check; MyFitCoach Forms runs as one instance, so that is sufficient. The send skips the connector's automatic network retry on purpose: a timeout does not prove the message was not delivered, and retrying could duplicate it.

**Failure never undoes a sign-up:** The welcome step runs after the submission is marked synced and never throws. A failure is stored in `welcome_error`; the onboarding list shows a "Welcome not sent" pill and the submission page has a "Send welcome message" button. A successful "Retry Trainerize sync" also sends the welcome.

**Name tidying:** An all-lowercase or all-capitals first name is title-cased ("john" -> "John", "mary-kate" -> "Mary-Kate"); mixed case is left exactly as typed so "McKenzie" survives.

**Trainerize doc error found on the way:** `/user/getProfile` needs `usersid` (an array of integers), not the `userID` shown in the doc's example, and the response is `usrProfile`, not `users`. The example body returns 404.

### Enter key and auto-advance on the client forms (September 2026)

All three client forms (weekly, EOM, onboarding) run on `forms/public/checkin.html`, so these rules apply to every one of them.

**Enter means "OK, next" on every step.** It is handled once, in the document keydown listener, and goes through `tryAdvance()` - exactly what the OK button and the down arrow do, including the required-answer check. It used to be wired into each text box separately, which left it inconsistent: it only worked after tapping into a single-line box, did nothing on scale, choice and multi-select questions (even answered ones), and on long answers called `goNext()` directly, skipping a required answer. Enter on a focused multi-select option also "clicked" it and silently un-ticked the answer; the handler now cancels that default.

**Exceptions, on purpose:** Shift + Enter in a long answer still makes a new line. On a phone or tablet with no mouse (`(hover: none) and (pointer: coarse)`), return in a long answer is ALWAYS a new line, because a phone keyboard has no Shift to hold - the client taps OK to move on, and the "press Enter" hints are hidden there. Single-line answers still move on with return on phones. Enter does nothing on the "Ready to send?" step, so a held or double-pressed Enter can never submit. Enter on the focused "previous question" arrow keeps going back. A held-down Enter (key repeat) is ignored so it cannot race through answered questions, and Enter while a predictive keyboard is mid-word is left alone.

**The answer box is focused on arrival** for single-line answers as well as long ones, so a name or email can be typed straight away.

**Auto-advance is tied to the question it started on.** Tapping a scale or single-choice answer moves on after 220ms so the highlight is visible. `advanceShortly()` records the question it was started from and does nothing if the form has already moved. A plain delayed `goNext()` fired once per tap, so a double-tap skipped the next question (reproduced on onboarding Q10, which jumped past Q11), and tapping an answer then pressing Enter would have done the same.

**Arrow keys and shortcuts:** Up and down move between questions only when the client is not typing in a box. Inside a long answer they move the cursor between lines (they used to jump to another question mid-sentence), and in date and number boxes they keep their normal behaviour. Letter and number shortcuts ignore Cmd, Ctrl and Alt, so Cmd+C on a multiple-choice question no longer picks answer C.

### Answer checks on the client forms (September 2026)

**The page checks each answer the way the server will, before moving on.** `answerProblem(step)` in `checkin.html` mirrors `validateOnboarding` (routes/onboarding.js) and `validateAnswers` (lib/form-data.js): required answers present, email matching the same pattern, numbers within the question's `min`/`max`, dates complete. When an answer is not acceptable the step shakes AND shows a sentence under it saying what to change (`.checkin__field-error`); the sentence goes as soon as the answer is edited.

**Why:** the page used to check only that something had been typed. A mistyped email, weight in stone or height in feet passed every question and was rejected at Submit with a 422. The page then sent the client to "the first unanswered question" - which does not exist when every question is answered - so they landed on the welcome screen, told an answer was "missing", with no way to find it. A new client could never finish onboarding.

**Number questions** carry an `invalidMessage` in the definition (bodyweight and height in onboarding) that says what unit is wanted. An empty number box gets that message too, because a browser leaves a number box empty when what was typed is not a number (`5'11`).

**If the server still refuses a submission** (422), the page now uses the `missing` list the server already returns: it goes to the first of those questions and shows its message.

**End-of-form wording per form.** The "Ready to send?" step, the thank-you line and the result heading come from the server per form (`end` in lib/form-types.js and routes/onboarding.js): "Submit check-in" / "Check-in received" for weekly, "Submit report" / "Report received" for EOM, "Submit" for onboarding. It was hard-coded to the weekly wording, so new clients were asked to "submit check-in".

### Client form layout on small phones (September 2026)

`.checkin__viewport` padding is 72px top and 96px bottom (64px / 88px under 640px wide), clearing the fixed logo and the fixed up/down arrows. With 32px, a question that filled an iPhone SE / 8 sized screen put its number against the logo and its last answer under the arrows, so tapping that corner of the answer changed question instead of choosing it. Checked across every step of all three forms at 320x640, 375x667 and 375x812: nothing under the arrows, nothing against the logo, no sideways scrolling.

### End of Month reports are filed under the month they are for (September 2026)

**Rule:** a report sent on the 1st to the 14th of a month (Dublin date) is the previous month's report; from the 15th on it is that month's. `getCurrentEomCycle()` in `backend/lib/cycle.js` and `forms/lib/cycle.js` - two identical copies, because the apps share no code. Used for filing new reports (MyFitCoach Forms and the old Typeform webhook) and for the Check-in Hub's "current month" (`/api/checkins/hub` and `/api/checkins/pending/:clientId`). The two must always agree or a report files under one month while the hub looks at another.

**Why:** the report goes out on the last Saturday of the month and the deadline is the Monday after, which can be in the next month (Sat 31 Oct 2026 -> Mon 2 Nov; also Jan, Feb and Jul 2027). Filing by calendar month put anything sent on the 1st or 2nd under the new month. The report showed as next month's, the hub switched months on the 1st so that month's reports vanished from it mid-reply, and the client was still sent the 7pm "you haven't sent it" reminder, which looks for the old month.

**Why the 15th and not "the last Saturday":** anchoring on the prompt date would file a report sent a few days early (someone going on holiday) under the previous month, and would need the prompt date exceptions (December moved to Sat 19 Dec) copied into MyFitCoach Forms. The 15th covers reports up to two weeks late and any early ones without either problem. `getCurrentMonthFirst()` still exists for `seed.js` only.

**Hub side effect:** from the 1st to the 14th the Check-in Hub's EOM section shows the previous month's reports, which is the month Connor is replying to.

**Historical fix, 11 Sep 2026.** Seven real reports had been filed under the wrong month and were moved in one transaction (`cycle_start` only). Rollback, if ever needed, is the reverse of each line:

| checkin id | client | was | now |
|---|---|---|---|
| 773 | Barry Freyne | 2026-04-01 | 2026-03-01 |
| 951 | Ronan Burke | 2026-06-01 | 2026-05-01 |
| 952 | Stephen Burdock | 2026-06-01 | 2026-05-01 |
| 1032 | Jason Tansey | 2026-07-01 | 2026-06-01 |
| 1118 | Brendan Traynor | 2026-08-01 | 2026-07-01 |
| 1140 | Jason Tansey | 2026-08-01 | 2026-07-01 |
| 1210 | Shane Errity | 2026-09-01 | 2026-08-01 |

None of the seven clients already had a report in the target month (checked in the same transaction). The test client "ZZ Forms Test Client" (10 Jul) was left alone.

### CSV export and dependencies (September 2026)

**CSV cells that could run as formulas are neutralised.** Answers come from public forms, and Excel / Google Sheets execute a cell starting with `= + - @` (or a tab or carriage return). `csvCell` in routes/admin.js prefixes such text with an apostrophe so it shows as plain text. Numbers are left alone.

**`qs` is pinned to ^6.16.0** through `overrides` in `forms/package.json`. Express 4.22.2, the newest 4.x, still requires `qs ~6.15.1`, which has two moderate denial-of-service advisories (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). 6.16 is a minor release; query-string parsing checked unchanged. Remove the override once an Express 4 release allows 6.16. `npm audit` for MyFitCoach Forms is clean.

### Program PDF export (July 2026)

**What it does:** `tools/program-pdf/generate.sh "<client>" "<phase>"` turns any client's Trainerize training block into a print-ready A4 PDF. Each exercise name is a live link to its demo video, and each card carries the reps and sets the client last logged plus the number to beat. See `tools/program-pdf/README.md` for usage.

**What counts as "previous":** For every exercise in the block, the tool walks the client's *entire* logged history oldest-first, not just the preceding block. It keeps three things: the most recent session in which that exercise was actually logged, the heaviest set ever recorded (ties broken on reps), and the top-set weight per session for the sparkline.

**Why the whole history rather than the last block:** Blocks change. When Bill Blake moved from Phase 3 to Phase 4, seven of his eleven working exercises were new to the block - restricting history to the previous phase would have left most cards blank. Walking the full history means a movement that carried over from two blocks ago keeps its numbers, and a genuinely new movement is the only thing that shows as new. Every card labels the phase and date its figures came from, so an older number is never passed off as recent.

**Warm up versus working sets:** An exercise is only moved into the warm-up panel on an explicit signal: its record type is `general`, its coach note says "no need to track", or its name contains "warm up" or "stretch". Everything else gets a full working card.

The first attempt keyed this on rest time (rest of 0 means warm up), which held for Phases 3 and 4 but was wrong. Phase 2 leaves rest blank on main lifts - barbell box squat, Romanian barbell deadlift and the bulgarian split squat all have a rest time of 0 - so that rule buried three working lifts in the warm-up strip and stripped their previous numbers off the page. Phase 3's front foot elevated split squat was hit by the same bug. The rule is now deliberately cautious in the safe direction: mistakenly giving a mobility drill a numbered card costs nothing, whereas hiding a main lift loses real information.

**The both-sides flag:** When a prescription says "each side" and the logged reps are at least double the top of the prescribed range, the card notes that the numbers look like both sides added together. The threshold is deliberately strict (double the *top* of the range) so it stays silent unless the mismatch is unambiguous. This catches the common logging error the coach's own programming notes warn about - logging 24 for a 12-per-side set - without second-guessing legitimate entries.

**Why Chrome prints the PDF:** Chrome headless is the only renderer available on the machine that preserves `<a href>` as real PDF link annotations, which is the whole point of the exercise links. `weasyprint` and `wkhtmltopdf` are not installed. The script probes the usual Chrome, Chromium and Brave install paths and fails loudly if none is found.

**Fonts are embedded, not fetched:** The DM Sans latin subset is base64-embedded in the generated HTML from `tools/program-pdf/assets/`. The document makes zero external requests, so it renders identically regardless of machine or network.

**Timed holds:** Planks, wall sits and side planks are prescribed in seconds, but Trainerize stores those seconds in the reps field, so they were being displayed as "82 reps" for what was an 82 second plank. When the prescription text mentions seconds or minutes, the logged numbers are labelled as time instead. The per-side flag is also suppressed for these, since a 45 second hold against a "20-30 seconds each side" prescription is not a logging error.

**Pagination:** Exercise cards are packed onto pages by estimated height (a base card, plus the tag row, wrapped cue lines, sparkline and any flag), then a rebalancing pass moves a card forward when that evens out the page fills. This replaces per-workout hardcoded page splits so sessions of any length lay out correctly. The block tracker's notes area is sized the same way, taking whatever space the exercise grid leaves - a 15-exercise block like Phase 2 would otherwise push the closing note off the sheet.

The constants are in millimetres, measured against rendered output, and are the fragile part of this tool. Pages are fixed height with `overflow: hidden`, so an underestimate clips content rather than reflowing it. The build asserts the printed sheet count matches the layout's page count, but that only catches a page growing past its bounds, not content clipped inside one. Eyeball the first output for a new client before sending it, and re-measure the constants if the card design changes.

---

## Trainerize Auto Messages (July 2026)

### What they are, and how they differ from everything else that sends a message

**What it does:** An Auto Message is a message that sits on a date in the client's Trainerize calendar and fires at a set time. It is a Trainerize object, visible in the Trainerize app, and it sends whether or not the portal is running.

This is a third, separate mechanism. Do not confuse the three:

- **Scheduled DMs** (`scheduled_messages` table) - the portal holds these and the portal's own scheduler sends them via `/message/reply`. If the portal is down at send time, they wait.
- **Scheduled group posts** (`scheduled_posts` table) - same pattern, posted to a group thread.
- **Auto Messages** (this section) - live entirely inside Trainerize. The portal creates them and then has no further involvement. Nothing is stored on our side except a run log.

---

### The naming trap - `autoMessage` is not the auto message

**The single most important fact in this section:** the feature called "Auto messages" in the Trainerize calendar is served by the `dailyMessage/*` endpoints, **not** `autoMessage/*`.

`autoMessage/*` does exist on the public API, but it is a completely different feature: the business-level auto-responders under Settings (welcome message, birthday message, vacation responder). Its methods are `getList`, `get` and `set`, keyed on `groupID`/`type`/`isActive`, plus `automessage/send`. All of them return **403 "No privilege to access auto message"** on our API token, and that privilege is not something we can grant ourselves.

Earlier attempts to build this failed on exactly that 403. The conclusion drawn at the time - that auto messages are not reachable via the API - was wrong. It was the right error message on the wrong endpoint.

**How the mapping was confirmed:** Trainerize's web app bundles are served unauthenticated from `myfitcoach3.trainerize.com`. In `gt.modules.<version>.min.js` the calendar's "Auto messages" button resolves to `ActivityType.autoMessages`, which dispatches to `DailyMessageService`, whose `add$` posts to `dailyMessage/add`. The dialog that builds the payload is `/widgets/gt.dialog.dailyMessage/js/widget.min.js`. If the payload shape ever changes, re-read those two files rather than guessing.

---

### The endpoints and the exact payload

None of this is in the official API documentation. It was recovered from the web app source and then verified against the live API.

```
POST /v03/dailyMessage/add      -> { id }
POST /v03/dailyMessage/get      { id, userID }
POST /v03/dailyMessage/set      full object plus id
POST /v03/dailyMessage/delete   { id, userID }
```

Create payload:

```json
{
  "userID": 5346208,
  "date": "2026-08-29",
  "sendTime": 720,
  "title": "EOM Report TESTER",
  "detail": { "messages": [ {
      "body": "the message text",
      "type": "text",
      "messageID": null,
      "source": "user",
      "sender": { "userID": 5343380, "firstName": "Connor", "lastName": "Meyler" },
      "linkInfo": null, "workoutInfo": null, "attachment": null,
      "productInfo": null, "appointmentInfo": null, "externalAppointmentInfo": null
  } ] }
}
```

For a master program rather than a client calendar, swap `date` for `day` (day number) and `programID`. Program calendars also have their own `program/addCalendarMessage` and `program/deleteCalendarItem`.

**Field notes, all verified by test:**

- `title` is **required**. Omitting it returns a 500 "Failed to add daily message". It is coach-only and never shown to the client - it is the label you see on the calendar.
- `sendTime` is **minutes from midnight**, so 720 is 12:00 and 540 is 09:00.
- The app's dropdown only offers 5:00am to 9:00pm in 30 minute steps (300 to 1260), but the API accepts any minute value. 547 and 60 both stored and read back correctly. Staying inside the dropdown range is safer if the message should also be editable in the app.
- The API accepts more than three messages in `detail.messages`, but the app's dialog caps at three and only renders three. Do not exceed three.
- ~~`{firstName}` and `{lastName}` tokens are stored verbatim and resolved by Trainerize at send time.~~ **WRONG - corrected 6 Aug 2026.** They are stored verbatim and then sent verbatim. A test message scheduled on Connor's own account arrived reading "Good afternoon {firstName}" literally. Personalise the body yourself before calling `dailyMessage/add`; `personalise()` in `backend/lib/auto-messages.js` does this, giving each client their own copy of the body with their real name already in it.
- A minimal message of just `{ body, type }` is accepted; the null fields above are what the app sends and are kept for fidelity.
- Past dates are accepted without complaint. There is no server-side guard against scheduling into the past.

---

### Timezone - why this one is not Dublin

**Every other scheduled thing in the portal is stored UTC and displayed in Europe/Dublin.** Auto Messages are the exception and must not be converted.

`sendTime` is a wall-clock time resolved against **the client's own Trainerize timezone**, not ours and not UTC. Setting 720 means each client gets it at their local noon. A client in Dublin and a client in New York both receive it at 12:00 their time, five hours apart in real terms.

So: do not apply the Dublin-to-UTC conversion used by `scheduled_messages` when writing `sendTime`. Write the intended local hour directly. If a send time ever needs to be shown in the portal UI, label it as client-local, not "(Dublin time)".

---

### The hard limitation - existing auto messages cannot be listed

**There is no way to enumerate auto messages through the API.** This is the one real gap, and it is worth recording precisely so nobody spends another afternoon on it.

Four independent routes were tried and all are closed:

1. **No list endpoint exists.** All 681 endpoint strings were extracted from the web app bundles. There is no `dailyMessage/getList`, and nothing else lists them either.
2. **`calendar/getList` silently omits them.** The API docs claim `dailyMessage` is a possible `calendar[].items[].type`, but it is never returned. Proven by creating an auto message on a date that already had one item and confirming the item count stayed at 1. Tried with camelCase `userID`, the web app's lowercase `userid`, and the `filter.userPrograms` variants the web app sends.
3. **`dailyMessage/get` is id-only.** Lookup by `date`, by `startDate`/`endDate`, and with `id: 0` all return 404 "Can't find daily message".
4. **The web app's own auth cannot be borrowed.** `user/getLoginToken` mints a token, but the API rejects it as both `TRAUV1 <userID>_<token>` and `Bearer <token>` (401). The `SetupTokenLogon` handshake at `/app/wh/AjaxService.asmx/` that would exchange it for a `tr_uatoken` session cookie is blocked at the edge (nginx 405).

**What this means in practice:** we can create, read by id, update and delete. We cannot discover what already exists. Deleting or replacing pre-existing auto messages requires either reading the ids out of a logged-in browser session, or clearing them by hand in the Trainerize app.

---

### Delete and recovery pattern

Because auto messages cannot be listed, **the run log is the only record that a batch ever happened.** Treat it as the recovery mechanism, in the same spirit as soft delete on scheduled posts.

The bulk scheduler writes a JSON run log containing every created id, and rewrites it after each individual create rather than at the end, so a crash mid-batch still leaves every id already written recoverable. `--rollback <run log>` deletes only the ids in that file. Nothing else is ever deleted.

If a batch is run without keeping its log, those messages become unmanageable from our side - they can only be removed by hand in the Trainerize app. Keep the logs.

---

### Verification and current state

The whole surface was proven end to end against the live API using **Connor's own client account (`5346208`, connormeyler@gmail.com)**, which is separate from the trainer account (`5343380`). Every probe record was deleted afterwards and each deletion confirmed by a follow-up `get` returning 404. No real client account was written to at any point during discovery.

**Currently live:** "EOM Report TESTER" is scheduled on client `5346208` for the last Saturday of each month at 12:00 client-local, twelve occurrences from 2026-08-29 through 2027-07-31. Ids `92264268` to `92264279`.

Note that the last-Saturday date maths here is the same rule already implemented by `getEomDeadlineMonday(year, month)` in `cycle.js` for the EOM reminder DMs. If auto messages are ever wired into the portal proper, reuse that function rather than writing a second implementation.

---

## Shared form links and name matching (August 2026)

### The decision

The weekly check-in and EOM report moved from **one personal link per client** to
**one shared link per form**, matching how Typeform had always worked:

```
forms.myfitcoach.ie/checkin    every MyFitCoach client
forms.myfitcoach.ie/monthly    every Core client
forms.myfitcoach.ie/join       onboarding (already shared)
```

The client identifies themselves by typing their name at question 1, using the
same wording the Typeform used: "Full name (as shown in Trainerize)".

**Why the reversal:** per-client tokens were built first, but they meant 40
distinct URLs to mint, distribute and keep straight, and every auto message
body had to be personalised. Connor's judgement was that the token scheme was
messier than the problem it solved, and that name matching had worked well for
1,000+ submissions. Reverting removed the entire token-minting job from the
rollout and made the auto message body identical for every client.

### Matching

`forms/lib/match.js` is a deliberate copy of the algorithm in
`backend/routes/webhooks.js` - same normalisation (strip fadas, apostrophes and
punctuation, lowercase, collapse spaces), same Levenshtein similarity ratio,
same **0.8 threshold**. A name that matched under Typeform matches identically
here.

It is duplicated rather than imported because MyFitCoach Forms is deliberately
free of any code dependency on the portal. If the threshold is ever tuned,
change both.

Verified behaviour: "Seán Ó Briain" matches "Sean O Briain" at 100%,
"Jonathon Stanley" matches "Jonathan Stanley" at 94%, and "Dave" against
"David Goggins" scores 23% and correctly does not match.

### Unmatched submissions are never discarded

**This is the one place the new system deliberately differs from the old one.**

The Typeform webhook drops an unmatched submission on the floor - it logs a
warning and returns 200, and the portal never sees it. (The response still
exists in Typeform's own Responses area, so the data was not destroyed, but
nothing reached the portal and nothing flagged it.)

MyFitCoach Forms instead writes it to `unmatched_submissions` with the answers
and the built `form_data` intact, plus the closest client and that score as a
suggestion. `/admin/unmatched` lists them with a badge in the nav, and assigning
one inserts it into `checkins` exactly as the matched path would have, using the
same `mfc_<uuid>` response id so the dedup index still applies.

**Why a separate table rather than a nullable `checkins.client_id`:** the
reminder scheduler uses `cl.id NOT IN (SELECT client_id FROM checkins ...)`.
A single NULL in that subquery makes `NOT IN` return no rows for everyone, which
would silently stop every check-in reminder. A separate table cannot affect any
existing query.

The submitted name is stored verbatim in `form_data` even after assignment, so
the record always shows what the client actually typed.

### Drafts are keyed by browser, not by client

`form_drafts` was keyed `(client_id, form_type, cycle_start)`, which required
knowing who the client was on page load. With a shared link nobody is
identified until question 1, so drafts are now keyed on the **submission UUID**
the browser generates and holds in `localStorage`, the same pattern
`onboarding_drafts` already used. `client_id` is now nullable and unused.

The UUID is cleared on successful submit so the next cycle starts a clean draft
rather than resuming a finished one.

### The remembered name

After a successful submit the browser stores the typed name under
`mfc_client_name`, shared between the weekly and monthly forms since the same
person fills both on the same device. On the next visit it is sent to
`/state`, which resolves it so the welcome screen can greet them by name and
tell them whether they have already submitted this cycle, and question 1 comes
prefilled.

**The prefill deliberately does not auto-skip the question.** A shared or family
device would otherwise file one person's check-in under another's name with no
visible signal. Prefilled plus one keypress is the whole benefit; skipping adds
a failure mode that cannot be seen.

### Field refs are unchanged

The name question reuses the original Typeform refs -
`be65ced6-dd03-44dd-86a8-e09d7d48f334` for the weekly form and `eom-name` for
the EOM report - and is stored with `fieldType: 'short_text'`. 1,039 historical
weekly check-ins and 26 EOM reports already carry those exact refs, so new
submissions are indistinguishable in shape from the Typeform era and every
portal parser, trend graph and CSV export works unchanged.

`form_links`, `lib/tokens.js` and `db/generate-links.js` are left in place but
unused, in case per-client links are ever wanted again.

---

## Auto messages and reminders: the programme switch (August 2026)

### Two mechanisms, one per cadence

A client on a programme has two things pointed at them:

| | Sunday / last Saturday | Monday 7pm |
|---|---|---|
| What | The prompt with the form link | The nudge if nothing came in |
| Where | Trainerize **calendar** (`dailyMessage`) | Trainerize **DM** (`message/send`) |
| Held by | Trainerize, via `auto_messages` log | The portal's own scheduler |
| Fires | Always | Only if no check-in for that cycle |

### Switching a client between programmes

The **reminder** half needs no action. Both reminder queries filter on
`clients.program`, so changing the programme moves the client from one pool to
the other on the next scheduler tick. Nothing else to do.

The **calendar** half does need action, because those messages are already
sitting on dates in Trainerize. `--switch "<name>"` removes the wrong-kind
messages and schedules the right ones.

### Reminder timing is now per client, both cadences

Weekly moved from Monday 8:30pm to **Monday 7pm** - one hour after the 6pm
deadline stated in the Sunday prompt, so it reads as a grace-period nudge
rather than a pre-deadline warning that contradicts the stated cutoff.

The EOM reminder was firing on a single `dublin.hour >= 19` gate. It now
resolves 7pm in each client's own timezone, matching the weekly one.

**That change required removing the `hasEomRemindersBeenProcessed` gate**, and
this is the subtle part. That helper asked "has any reminder been logged for
this cycle?" and skipped the whole block if so. Safe only while every client
fired in the same minute on Dublin time. With per-client timezones the first
client reminded would have marked the cycle done and every client further west
would have been skipped permanently. Both reminders now exclude clients
per-row via `reminder_logs` instead. Do not reintroduce a cycle-level gate.

### The log can disagree with Trainerize, and self-corrects

Messages deleted by hand in the Trainerize app leave `auto_messages` stale: it
still claims 52 are scheduled when they are not. A stale count would make the
idempotency check skip that client, leaving them silently with no prompt.

`reconcileClient()` handles it. It samples the next few recorded messages, and
if any is missing it checks every one and marks **only** the genuinely absent
rows deleted.

The two-pass design is deliberate. Clearing the client's whole log when a small
sample came back missing was the first attempt and it was wrong: a coach who
deleted only the next few weeks would have had all 52 rows marked gone, and the
reschedule would then have stacked a fresh year on top of the ~48 still live in
Trainerize. Marking only what is verifiably absent cannot produce duplicates.
Verified by deleting 4 of Connor's 52 behind the log's back: reconcile found
exactly 4 and left the other 48 alone.

### The safety net

`--status` reports two conditions, because a switchover done by hand and never
mentioned here is the expected case, not the exception:

- **Programme mismatch** - on Core but still holding weekly messages, or vice versa
- **Nothing scheduled** - on a programme but with no prompts at all

Both are reported only. Correcting is always a deliberate `--switch`, never
automatic, because silently creating or deleting messages on a client's
calendar is not something a status command should do.

---

## Database backups (August 2026)

**Before this, there were none.** Railway only offers backups on the Pro plan
and the account is on Hobby, so the Backups tab read "No Backups". The entire
business - 167,000 rows including 15 months of check-ins - existed in exactly
one place.

### Where they go, and why not Railway

Daily full dump to **Cloudflare R2**, free at this size (77 MB database, ~12 MB
compressed per backup; the free tier is 10 GB).

Railway Pro would have given backups plus point-in-time recovery for $20/month,
but those backups live *inside Railway*. That protects against a corrupted
database and not against losing the account, which is the failure that actually
ends a business. An off-platform copy covers the worse case for nothing. The
two stack rather than compete, so Pro remains worth adding later for finer
recovery granularity.

**The bucket has EU jurisdiction.** The data is health and fitness information
about identifiable Irish people - special category data under GDPR Article 9 -
so it stays in the EU. This is not cosmetic: **an EU bucket is unreachable on
the default `<account>.r2.cloudflarestorage.com` endpoint and answers 403
AccessDenied**, which looks exactly like bad credentials and is not. The host
must be `<account>.eu.r2.cloudflarestorage.com`. `R2_JURISDICTION` defaults to
`eu` for this reason.

### Why not pg_dump

It is not installed on the Railway container, and adding it means changing the
build. `lib/backup.js` produces the dump using the `pg` driver already present,
so it behaves identically locally and in production.

**Escaping is done by Postgres, not by us.** Every value is rendered with
`quote_nullable(col::text)` inside the SELECT, so Postgres itself produces the
literal for bytea, jsonb, timestamps and text. Hand-rolling that in JavaScript
would be a rich source of corruption discovered only on the day a restore is
needed.

### Two things that bit during the build

**Statement splitting.** The dump is ~135 MB of SQL. Sending it as one query
resets the connection, so it must be split. Splitting on semicolons or newlines
is wrong - both appear inside clients' free-text answers. Each dump therefore
carries a random per-dump delimiter, recorded in its own header, and restore
splits on that. `splitStatements()` refuses to guess if the header is absent.
Rows are batched 500 per INSERT, which shrinks the file and the statement count.

**The schema needs both migrations.** `backend/db/migrate.js` owns most tables,
but `form_drafts`, `form_links`, `onboarding_*` and `unmatched_submissions` come
from `forms/db/migrate.js`. Restoring into a database built from only one fails
on a missing relation. `verify` runs both.

### Verification is the point

`node backend/db/backup.js verify` creates a scratch database, builds the schema
from both migrations, restores the latest backup into it, and compares **every
table's row count plus content checksums** against production, then drops the
scratch database.

Row counts alone are not enough - a quoting bug would insert happily and corrupt
silently - so md5 checksums of `checkins.form_data`, client names and emails,
message bodies and titles are compared as well.

First verified run: 24 tables, 167,107 rows, every count and every checksum
identical.

### Retention

30 daily backups, plus the first backup of each of the last 12 months. Pruning
runs automatically after each backup.

### Commands

```
node backend/db/backup.js run                  take one now
node backend/db/backup.js list                 what is stored
node backend/db/backup.js verify [key]         prove it restores
node backend/db/backup.js restore <key> --into "<connection string>"
```

`restore` has no default target and never will. It requires an explicit
`--into`, so production cannot be overwritten by a typo.

The scheduler runs a backup daily at 03:00 Dublin. A missing R2 configuration
logs a warning once a day rather than failing silently, because a backup that
is quietly not running is worse than one that is loudly broken.

---

## Setting up one client: starting, restarting, switching (September 2026)

Three one-off scripts, all sharing the same shape: dry run by default, every
step checks its own state so re-running changes nothing, and the batch id at the
end rolls the messages back.

| Script | Client | What it does |
|---|---|---|
| `reactivate-gavin-bluett.js` | returning | Programme + skip a week + 52 weekly |
| `start-stephen-hudson-weekly.js` | brand new | Skip a week + 52 weekly |
| `switch-sean-mcgrath-to-core.js` | moved to Core | Programme + swap weekly for EOM |

### Skipping a client's first week without switching reminders off

A client who starts mid-week has no prompt for the current cycle, but the Monday
nudge does not know that. Its query picks up any active client on the programme
with no check-in and no `reminder_logs` row for the cycle, so a new or returning
client matches all three conditions and gets chased for a check-in they were
never sent.

**The fix is a `reminder_logs` row written ahead of time**, with `sent = false`
and a `skipped_reason` saying why. The scheduler's own deduplication then skips
them, because it cannot tell the difference between "already reminded" and
"deliberately marked handled".

**Why not toggle `clients.reminders_enabled`.** It would work, but it needs a
second action later to turn back on, and a forgotten toggle is silent - the
client simply never gets chased again. The log row suppresses exactly one cycle
and needs no follow-up.

The cycle to suppress is the Sunday **before** the first prompt, matching
`getCurrentCycleSunday()` on the Monday in question. Gavin Bluett, 4 Sep 2026:
first prompt 13 Sep, suppressed cycle `2026-09-06`. Stephen Hudson, 12 Sep 2026:
first prompt 20 Sep, suppressed cycle `2026-09-13`.

To start the run a week late, pass the skipped Sunday as the `from` argument of
`nextSundays()`. It returns Sundays strictly after that date, so the run opens on
the following one. Each script asserts the first date is what was asked for and
refuses to schedule if not.

### `--switch` applies the EOM month exceptions

`switchClient()` built its dates from `nextLastSaturdays()` and stopped there, so
a client moved onto Core mid-year got the raw last Saturday. Sean McGrath, 8 Sep
2026, would have been the first: 26 December on his own, Christmas weekend, with
the standard wording, while the other twelve Core clients sat on the 19th.

`applyEomExceptions()` now lives in `lib/auto-messages.js` rather than in the
scheduling script, because both callers need it - the yearly run and the
single-client switch.

### A programme switch keeps the prompts already sent

`rollbackClient()` takes `{ futureOnly }`. The switch path passes it; undoing a
batch created in error does not.

Two reasons. The count reported by the dry run came from `liveCountFor()`, which
is future-only, while the deletion was not, so it removed more than it said it
would. And a prompt already delivered is a true record of what the client was
sent, worth keeping on their calendar.

### Known limit: deleting a message that is already gone

`/dailyMessage/delete` returns 404 for a message deleted by hand in the
Trainerize app, and `deleteOne()` counts that as a failure, leaving the row
`deleted_at IS NULL`. The log then claims messages exist that do not, which
`findProgrammeMismatches()` reports as a mismatch.

This happened on all 47 of Sean McGrath's weekly prompts, which Connor had
already cleared in the app. `reconcileClient(clientId, kind)` is the repair: it
checks every live row and marks exactly the absent ones deleted. `fetchOne()`
already treats 404 as gone, so only deletion is out of step.

## Onboarding sets the Trainerize programme tag (September 2026)

Everyone who completes the onboarding form is a high ticket client. Connor,
12 Sep 2026: Core clients are only ever moved across from the high ticket
programme, so they already exist in Trainerize and he sets them up by hand.
Nobody onboards straight onto Core, so `forms/routes/onboarding.js` has one
programme and one tag, not a branch.

`DEFAULT_PROGRAM` and `PROGRAM_TAG` sit together and must agree. The portal reads
the first, Trainerize the second, and `reconcileClients()` treats the tag as the
source of truth - so if they ever disagree, the nightly reconcile wins and
rewrites the programme.

**The tag was missing entirely until now.** The form created the client, the
portal row and the welcome DM, but never tagged anyone. Stephen Hudson was the
first real client through it and arrived untagged. Nothing broke, because a
missing tag reads as "unknown" to the reconcile rather than "no programme", so it
never cleared what was set - but he was absent from every tag-based view in the
Trainerize app.

### `/user/addTag` is not idempotent

Tagging a client who already carries the tag returns **500 "Failed to add user to
user tag"**, indistinguishable from a real failure. Verified against a live
client on 12 Sep 2026.

This bites on the admin Retry button, where a second sync would report a tag
problem that does not exist. `ensureTag()` therefore checks rather than believes:
on any failure it reads the tag's membership back, and only raises if the client
genuinely is not on it. A tag that does not exist still throws, as it should.

### A failed tag never fails the sign-up

By the time the tag is attempted the client exists in Trainerize and their invite
has gone. The failure is returned as `tagError`, folded into the submission's
`sync_error` next to the over-limit warning, and surfaced in the admin area for
Connor to fix by hand. The client sees a normal success screen.

## EOM auto messages, and the one-off month exception (August 2026)

### What was scheduled

144 EOM calendar prompts committed on 7 Aug 2026: **12 Core clients x 12 months**,
Sat 29 Aug 2026 through Sat 31 Jul 2027, 12:00 in each client's own timezone.

Rollback batch id: `eom-2026-08-07T11-12-28-405Z`

Verified by reading back from Trainerize rather than trusting the log: all 12
December messages plus a random sample of standard ones, checking the date, send
time, title, the greeting name and the exact copy.

### Months that break the last-Saturday rule

`EOM_EXCEPTIONS` in `lib/auto-message-templates.js` is keyed by the calendar
month the report covers (`YYYY-MM`). An entry replaces the computed date and the
body for that one send. Everything else is untouched.

The only entry is **December 2026**. The last Saturday is the 26th, Christmas
weekend, so the prompt moves a week early to **Sat 19 Dec** with its own copy
explaining why and giving a Monday 21 Dec deadline.

An exception only ever moves a date *earlier within its own month*, so the run
stays in order and stays one-per-month. `applyEomExceptions()` in
`db/schedule-auto-messages.js` prints every swap it makes in both the dry run and
the commit, so a moved month can never be applied silently.

### The reminder date follows the moved Saturday, the wording does not

**The Monday nudge is not attached to the calendar message.** It is a separate
mechanism, and its date is worked out by `getEomDeadlineMonday()` in
`lib/cycle.js`. Left alone that function returns "last Saturday of the month +
2 days", which for December 2026 is **Monday 28 December** - a week after the
deadline the moved message states.

So `getEomDeadlineMonday()` now checks `EOM_EXCEPTIONS` first. For an exception
month it returns that month's actual prompt date plus two days, giving
**Monday 21 December 2026**.

**The Monday is derived, never configured.** There is no `deadlineMonday` field
to set, precisely so a future edit cannot move the Saturday and leave the Monday
behind. Change the exception's `date` and the reminder follows automatically.

**The wording is unchanged.** Connor's call on 7 Aug 2026: the reminder body
stays constant for every month, only its date moves.

Verified: December 2026 resolves to Mon 21 Dec, it is genuinely a Monday, the
other eleven months in the batch are byte-identical to before, and replaying the
scheduler's own month-matching loop across every Monday in December 2026 fires
exactly once, on the 21st, for cycle `2026-12-01`. Nothing fires on the 28th.

The `cycle_start` is still keyed on the calendar month, so a report submitted any
time in December counts for December regardless of which Monday the nudge lands
on, and anyone who has already submitted is excluded by the existing `checkins`
subquery.

**If you add a future exception, this is now automatic.** `cycle.js` requires
`auto-message-templates.js`, which is plain data and requires nothing itself, so
there is no circular import. `forms/lib/cycle.js` does not carry a copy of
`getEomDeadlineMonday()`, so there is nothing to keep in step on that side.

### Clients who do not do EOM reports

`EOM_OPT_OUT` in the same file lists them by exact `clients.name`. They stay on
the Core programme and keep everything else, they just get no monthly prompt.

Currently: **Martin Farrell** (his `reminders_enabled` was already false, so he
gets no nudge either).

A list in code rather than a one-off `--exclude` flag, for two reasons. A re-run
cannot quietly put him back. And `findMissingSchedules()` reads the same list, so
`--status` does not report him under "NOTHING SCHEDULED" forever - a safety net
that cries wolf is one that gets ignored.

Adding someone to the list does **not** remove messages they already have. Use
`--rollback-client "<name>" eom` for that.

---

## The 1-10 scale buttons running off screen on iPhone (August 2026)

Connor reported the weekly form's 1-10 buttons overflowing the right edge on his
iPhone 17 Pro, in the WhatsApp in-app browser. Buttons 5 and 10 were cut off and
`overflow: hidden` on `html, body` meant there was no scroll to reveal them.

**It did not reproduce anywhere.** Chromium and real WebKit (Playwright) were
both correct at 375, 390, 393, 402 and 430pt against the live page with the web
font loaded. What cracked it was Connor noticing that changing the iOS system
text size to anything else - even away and straight back - fixed it until the
next fresh load.

### The mechanism

He runs a non-default system text size, so iOS inflates text on web pages.

A grid item's automatic minimum size is its content, so a button can never be
squeezed below what its own contents need. Past a certain font size that minimum
beats the `1fr` share, every column widens, and the grid overflows its container.
The `.checkin__scale-labels` row underneath is unaffected, which is why it still
aligned correctly in the screenshot while the buttons did not - that asymmetry is
what identified the buttons as the culprit.

The inflation is applied on first layout, before the web font finishes
downloading. Changing the text size forces a fresh layout, which comes out right.
Hence "it fixes itself if I poke the setting".

### The fix, both halves needed

1. `-webkit-text-size-adjust: 100%` on `html` opts out of the inflation. This is
   the cause-level fix. It is iOS-only behaviour: desktop WebKit does not
   implement the property at all and drops the declaration, so it cannot be
   verified outside iOS. Chromium confirms it parses and applies.
2. `minmax(0, 1fr)` on the tracks plus `min-width: 0` on the buttons removes the
   automatic minimum, so the grid **cannot** overflow at any font size. This is
   the backstop, and it is the half that is provable here.

**Do not drop either half.** Half 1 alone leaves the failure mode in place for
any other cause of inflation. Half 2 alone leaves the digits oversized.

Verified on WebKit against the edited file at 375/390/393/402/430pt and desktop,
at normal size and at 24, 36, 48, 64 and 90px button text: no overflow anywhere,
and no horizontal document scroll. Before the fix the same test overflows.

**Accessibility trade-off, Connor's call on 7 Aug 2026:** a client who has raised
their system text size will now see this form at its designed size rather than an
inflated one. The form already uses large type and is one question per screen.

`/checkin`, `/monthly` and `/join` all serve this same `checkin.html`, so the fix
covers all three forms.

---

## Weekly check-in question revision (August 2026)

Connor's own read of what the form was missing, worked through question by
question. Three problems he named, and what was done about each.

### Problem 1: no read on how the client feels

The form measured what they did and what they thought happened, but nothing
about how they felt doing it, so the tone of a Loom had to be guessed from the
text answers.

**Added question 11, "How much did you put in this week?"** It sits immediately
before "did you progress", because neither number matters much alone. The gap
between them is the signal:

| | Regressed / same | Progressed |
|---|---|---|
| **High effort** | Frustrated. The quit risk. Never "push harder" here | Working. Confirm it and leave it alone |
| **Low effort** | Stuck. Find the blocker, shrink the ask | Coasting. Nudge while it is still going well |

**Rejected: a weekly "how confident are you in the direction" rating.** It was
proposed and Connor was right to refuse it. It is a question about the coaching
relationship, and relationships do not move weekly, so it would have been
answered by mood. The EOM report already asks it monthly, which is the right
cadence.

**Rejected: "one thing you'd do differently".** Same reason, and the EOM already
asks its own version monthly. Connor's words: clients would start thinking "what
is this, a daycare".

**Instead, the weekly version of that signal is opt-in.** A new option in the
help list, under a new "Progress" heading: *"I want to know if I'm actually on
track"*. The distinction that matters is **asked versus available**. An open
question every week is a prompt, and people invent an answer to fill it; an
option in a list they are already reading is a door only the person who feels it
opens. It is also answerable from data already in the portal, which an earlier
draft ("I'd like to talk through the plan itself") was not - Connor pointed out
that ticking it could mean anything from a two-minute reassurance to a full
walkthrough of the block.

### Problem 2: contradictory answers

Clients scoring an area well and then asking for help with it.

**Added question 16, shown only when the week scored under 24 AND the client
ticked "No, all good, just keep me accountable".** Under 24 is the existing
boundary between the "In control" and "Underperforming" bands, not a new
threshold - so it fires exactly when the client is about to be shown an
Underperforming or Critical end screen anyway. Optional, and it never blocks a
submission.

This is the contradiction worth interrupting: the person having a rough week who
says nothing is wrong is the person who quietly cancels.

**Deliberately NOT done: prompting on high-score-plus-asked-for-help.** Connor's
call - an 8/10 sleep week is a good week and the client does not need chasing
about it. The combination will still appear and still needs interpreting. If it
becomes annoying, the fix is probably to tighten the option wording rather than
add a follow-up question.

### Problem 3: help requests that cannot be actioned

*"I need help structuring my routine this week"* asked Connor to plan a week he
could not see. Two other options had the same flaw or duplicated it.

| Removed | Replaced with |
|---|---|
| "I'm struggling to fit sessions into my week" (Training) | "I can't see where my sessions fit next week" |
| "I need help structuring my routine this week" (Lifestyle) | "I've too much on - give me a stripped-back plan for next week" |
| "I'm unsure about the overall plan structure" (Training) | nothing - the useful half is the new "on track" option |

The first two were near-duplicates of each other in different sections, so the
signal was split across two boxes and neither had a follow-up.

The stripped-back wording is Connor's. It matters that it is a **request rather
than a confession**: "I knew what to do and didn't do it" is true far more often
than it is ticked, because nobody volunteers that about themselves.

### Also changed

- **Question 13, the overall week rating, moved from question 2.** Asked first
  it was a mood reading taken before the client had thought about training, food
  or sleep, and it routinely contradicted the detail that followed. The EOM
  report already asked it late (question 11 of 15); the weekly now matches.
- **Added question 7, alcohol**, as bands rather than a number. Asked EVERY
  week, deliberately not conditional on a poor nutrition score: the client worth
  catching is the one who rates nutrition 8/10, genuinely ate well, and drank
  fourteen pints. That week is invisible in every other number on the form.
  Bands because a precise figure invites under-reporting and the band is all the
  detail needed. Drinks rather than units because a conversion table before the
  answer means blanks and guesses.
- **Question 10a reworded** to the EOM's version, which prompts with examples.
  A bare "what was the source of stress?" gets one-word answers.
- **Removed the nutrition "information issue or execution issue?" question.**
  Connor's call: the free-text answer above it already says which it was. What
  is lost is a pattern across weeks, since a category can be counted and free
  text cannot. Its ref stays mapped in `overview-parsers.js` so the answer still
  displays on the thousand-plus historical check-ins that have it.
- Trailing full stops dropped from three Lifestyle options for consistency.

### Why none of this touched the scores

`WEIGHT_BRACKETS` is the only thing that decides what counts toward the total,
and `parseScores` in the portal matches on an explicit list of field refs.
A question with a new ref is therefore invisible to scoring unless deliberately
added. Effort and alcohol are both outside it, so the total is still out of 45
and every historical week stays comparable with every new one.

Effort is surfaced to the portal as text ("9/10") using the same mechanism the
EOM report already uses for its confidence rating.

New questions use readable refs (`weekly-*`) rather than UUIDs, since they have
no Typeform history to match. They must never start with `eom-`, which is how
`overview-parsers.js` tells a monthly report from a weekly check-in.

### The score-based question needed the browser to score

The tough-week follow-up depends on the total rather than on a single answer,
and it has to appear before submit, but `computeScore` only ran on the server on
the way in. The scoring tables are now sent to the browser with the questions
and `conditionMet` grew two shapes: `all` (every sub-condition holds) and
`scoreBelow`. A `scoreBelow` condition with no score available is false, so a
part-finished form never triggers it, and forms with no scoring at all
(onboarding) are unaffected.

### Verified

39 automated checks over the definition, the answer builder, the validator and
the portal parser: question order and numbering, the score unchanged at 44 and
10 for a fixed good and bad week, effort and alcohol outside the score, the
tough-week question appearing and staying hidden across four combinations,
validation of the new questions, the help list contents, no em dashes, and
historical check-ins still parsing with their retired question intact.

Then the real form clicked through end to end in a browser against a throwaway
in-memory harness, never the live database - the real forms server autosaves a
draft row to production after every single answer, so filling it in on a laptop
would leave test data in real client data. A bad week showed all 16 questions in
the right order and stored all 22 answers with the correct refs, scoring 10/45
and showing the Critical end screen. A good week correctly skipped every
follow-up and did not show question 16 despite the client ticking "all good".

---

## The stutter between check-in questions (August 2026)

**The symptom.** Answering a question made the transition to the next one look
jumpy - as Connor put it, it jumps to the next question and then for a couple of
milliseconds seems to reload. Nothing was broken; it just looked wrong.

**The cause.** The step being replaced teleported to the top of the screen and
faded out from up there, while the new one appeared centred.

Two CSS rules were fighting:

- `.checkin__step` is `position: absolute`
- `.checkin__step--active` overrides that with `position: relative` **and
  `margin: auto 0`**, which is what centres the question vertically

The instant the active class comes off, the outgoing step goes back to
`position: absolute` and its margins collapse to zero, so it falls back to its
static position at the top of the viewport. Measured on a 1280x720 window:

| | Active | The moment it leaves |
|---|---|---|
| `position` | relative | absolute |
| `margin-top` | 229px | 0px |
| Distance from top of window | 261px | 32px |

A 229px jump upward, on every single question, right in the eye's path. It got
worse the taller the window, which is why it showed up on a laptop first.

**The fix.** `freezeLeavingStep()` in `checkin.html` copies the element's live
geometry into explicit `top`, `left` and `width` before the active class is
removed, so it stays exactly where the eye last saw it while it fades. The three
values are read before any of them is written, since setting one forces a reflow
and the next read would come back with the post-change value.

It deliberately touches only position, never `opacity` or `transform`, so the
intended 28px slide-and-fade is unchanged.

Applied in both places that run this transition: `render()` and `showDone()`.

**Verified** with a MutationObserver capturing the exact instant the class flips,
driven by a real click rather than a script. The outgoing step now stays at
261px instead of dropping to 32px - a jump of 0. Repeated on a 375x812 phone
viewport, also 0. Then the whole form driven through end to end: all 16
questions, 22 answers stored, score 10/45, end screen shown, and no orphaned
step elements left in the DOM.

**Worth knowing for future browser testing:** CSS transitions do not progress
while the browser pane is hidden, so `opacity` and `transform` read back stuck
at their starting values and animation-frame sampling stalls entirely. Layout
measurements (`offsetTop`, `getBoundingClientRect`) stay valid. Measure layout,
not animation, unless the pane is definitely painting.

---

## Readability of the check-in form (August 2026)

Connor reported eye strain reading the form, and noted most of his clients are
older than him with weaker eyesight.

### Contrast was never the problem

**Every element already passed WCAG AAA**, the strictest tier, before any change.
That is exactly why this went unnoticed. The strain came from three things the
standard does not measure:

**1. Too much contrast.** Pure `#ffffff` on pure `#000000` is 21:1, the maximum
possible. That causes halation: light text blooms into the dark background.
Astigmatism makes it markedly worse, and astigmatism is common with age. WCAG
sets a floor and no ceiling, so maximum contrast scores perfectly while being
genuinely uncomfortable to read. Now off-white `#E8EEED` on near-black `#0E1413`,
15.85:1 - still more than double the 7.0 AAA requirement, without the glare.

**2. Saturated colour used for reading.** Teal was the colour of the 1-10
numerals, every answer option, and the client's own typed answers. The eye cannot
bring cyan and a dark background into focus at the same depth (chromatic
aberration), so edges shimmer. **Teal is now accent only** - borders, fills, the
brand, the progress bar, icons, short labels. Anything read or typed is neutral.

**3. Thin strokes.** Typed answers were `font-weight: 300` in that saturated
teal, the worst of the three combined. **Nothing readable is below weight 400.**

Sizes were raised throughout; nothing a client reads is below 13px, and the
numerals went 18px/500 to 22px/600. Negative letter-spacing on headings was
softened from -0.02em to -0.005em.

### Two consequences that needed handling

**Text scaling was re-enabled.** `-webkit-text-size-adjust: 100%` was added days
earlier to stop iOS inflation pushing the scale buttons off screen. For this
audience, blocking a client's own text-size setting is the wrong trade. It was
removed. This is only safe because `minmax(0, 1fr)` + `min-width: 0` make the
overflow structurally impossible - that is the fix that matters. **Do not
reintroduce text-size-adjust.**

**The page had to become scrollable.** Bigger text means a long question can
exceed the screen, and `overflow: hidden` would have stranded it.

The first attempt at this was wrong and worth recording: `html, body` kept
`height: 100%` and gained `overflow-y: auto`. That makes **body**, not the
document, the scroller, and the page reported no scrollable height at all - a
1392px step in an 852px screen was unreachable. The fix is to stop pinning the
page to one screen: `min-height: 100%` on `html, body`, `min-height: 100svh` on
the viewport, and `margin: auto 0` on the active step. Auto margins centre it
while still allowing downward overflow; `align-items: center` clips the top
instead.

### The answer box now grows

`.checkin__textarea` was a fixed 96px box with no auto-grow, so a long answer was
clipped mid-line and clients could not read back what they had written. It now
grows with its content.

`height` must include the 2px bottom border (`box-sizing: border-box`), or the
last line is clipped by exactly that much - measured, not theorised.
`overflow-y: hidden` keeps `scrollHeight` an honest measure and prevents an inner
scrollbar.

### Verified

No horizontal overflow at 375/390/393/402/430pt and desktop, at normal text and
at 32, 48 and 72px forced inflation. A too-tall step keeps its top visible and
the page scrolls. Textarea grows from 128px to fit any length with nothing
clipped and no inner scrollbar. Every element still AAA.

### Known, not addressed

A textarea answer is only written to the draft on Enter or the OK button, not as
the client types, unlike the single-line input which saves on every keystroke.
Left alone as it is a behaviour change rather than a readability one.

---

## Onboarding archive (August 2026)

331 onboarding questionnaires filled in on Typeform before MyFitCoach Forms
existed: 322 on the original form `UPiYhp4b` (Aug 2021 to Mar 2026) and 9 on
`H4Y0MeYY` (Mar to Jul 2026).

### Deliberately unconnected

Connor's requirement, in his words: "somewhere I can just keep old onboarding
forms if I ever want to look back in the future. That's it." **No client link, no
Trainerize sync, no status.** An earlier plan to match them to clients by email
was dropped on his instruction.

**Its own table, not `onboarding_submissions`.** That table carries Trainerize
sync state (`synced` / `sync_failed`, `trainerize_user_id`), none of which means
anything for a historical record. Marking 331 rows `sync_failed` would have
filled the admin screen with permanent false alarms, and the alternative was
widening a CHECK constraint on a live table for the sake of dead data. A separate
table cannot affect any existing query.

### Answers keep their original wording and order

`answers` is an **ordered array** of `{ref, question, type, answer}`, not an
object keyed by field id. The two forms asked different questions - 30 versus 39,
and three separate old questions (blood pressure, medication, eating disorder
history) correspond to a single field on the newer form. Normalising them into
one shape would have misrepresented what was actually asked, so each answer
carries the question exactly as it was worded, in the order it was asked.

Typeform stores emphasis as markdown, so titles arrive as `*First name*`. Only
the markers are stripped; the wording is untouched.

### The import

`node forms/db/import-onboarding-archive.js` - dry run by default, `--commit` to
write. Idempotent via `UNIQUE (coach_id, source_response_id)` with
ON CONFLICT DO NOTHING, so it is safe to re-run and safe to resume.

**Typeform was in a major outage during this import** (INC-169, 7 Aug 2026), so
the client retries up to 25 times with backoff to 20s, and treats 5xx and 429 as
retryable while failing fast on other 4xx. Individual calls needed up to 11
attempts. Without that patience the import could not have completed at all.

### Verified after import

322 + 9 = 331 rows, zero duplicate response ids, and zero rows missing answers,
name, email or date. All 30 distinct questions from the original form are
present, confirming nothing was flattened away.

### Where to find it

`/admin/archive` in MyFitCoach Forms - a searchable list by name or email
(300 most recent shown, search narrows), and a detail page rendering the form as
it was asked. Read only: there is no edit or delete path by design.

---

## Admin session security (August 2026)

Connor asked whether MyFitCoach Forms was properly secured. The audit found it
password protected on every route, with a 16-character password, a 64-character
session secret, timing-safe comparison, and correct cookie flags on the live
site (HttpOnly, SameSite=Lax, Secure). Three real gaps sat behind that.

### The session key was a permanent skeleton key

**The worst of the three.** The cookie value was `HMAC(secret, 'mfc-forms-admin-v1')`
- a constant. Verified by logging in twice and getting byte-identical values.

So it never expired server-side (`Max-Age` is only a hint the browser is free to
ignore, and an attacker ignores it entirely), "Log out" cleared one browser and
locked nobody out, and a single leak - an old laptop, a sold phone, browser sync
into a compromised account - was permanent unrevokable access to 331 people's
health data with no action available in the app to close it.

The Coach Portal had the identical flaw, so both were fixed.

Tokens are now `v2.<issuedAt>.<epoch>.<hmac>`:

- **issuedAt** is checked against 30 days on every request, so expiry is
  enforced by us rather than by the browser's good manners. The cookie is
  reissued on each authenticated page load, so the clock runs from **last use**:
  regular use never logs you out, a device untouched for 30 days falls out.
- **epoch** comes from `auth_epochs`, one row per app. Incrementing it
  invalidates every token ever issued - the "log out everywhere" kill switch,
  at `POST /admin/logout-everywhere` (portal: `POST /logout-everywhere`).
- **hmac** covers the other three parts, so none can be edited.

Old v1 constant tokens no longer parse and are dead on deploy. The only visible
effect is having to log in once more.

**Auth fails closed until the epoch is loaded.** Both servers load it before
accepting traffic and exit if they cannot, matching the existing rule that a
failed deploy beats a lockout. Neither app can render anything useful without
the database anyway, so failing closed costs nothing and avoids honouring a
revoked token while the database is unreachable. The epoch is cached in memory
and refreshed every 15s; revoking updates the cache in the same call, so it is
immediate on a single instance.

`auth_epochs` is created identically by both migrations. Whichever runs first
wins, the other is a no-op. Keep the two definitions the same.

### Guessing the password was free and silent

12 wrong passwords went through in 2 seconds: no delay, no lockout, no record.
The password is long enough that guessing was never realistic, but nothing would
have told Connor anyone had tried.

Failures now carry an escalating delay (1s per consecutive failure, capped at
15s) and are logged with the source IP, as is a success that follows failures.
Held in memory deliberately - it defends against a burst, and a restart clearing
it is fine.

The Coach Portal already had a flat 1s delay and no logging; it now matches.

### MyFitCoach Forms leaked the password's length

Its `passwordMatches` compared plaintext, needing an early length check before
`timingSafeEqual`, which leaks the real password's length by timing. The portal
had already fixed exactly this by hashing both sides to a fixed length first.
The forms app now does the same.

### Security headers

HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
`Referrer-Policy` on both apps.

Mount them **above every route**. The portal's were first added below
`app.get('/login')` and `/robots.txt`, so Express never ran them for either. A
login page another site can frame is precisely what clickjacking needs. Caught
by checking the deployed headers rather than trusting the diff.

### Never gate a security control on NODE_ENV

The Secure flag and HSTS were both gated on `NODE_ENV === 'production'`. That
variable was set on the deployed service in the morning and **not set by the
afternoon**, so the session cookie silently lost its Secure flag and could have
been sent over plain http. Nothing failed, nothing logged, and the only reason
it surfaced was noticing HSTS missing from the live response and checking why
instead of assuming the deploy was slow.

Both now derive from the request: `req.secure`, or the first value of
`x-forwarded-proto`, with `app.set('trust proxy', 1)` so Express reads Railway's
forwarded headers. This cannot silently switch off, and it is correct locally
over http and in production over https without configuration.

`setSessionCookie` and `clearSessionCookie` therefore take `(req, res)`.

**No Content-Security-Policy.** The forms load Google Fonts and use inline
styles and scripts, and the portal serves a React bundle. A policy guessed at
rather than written against the real assets would break them silently. Worth
doing deliberately later.

### Verified

41 behavioural checks across both apps: tampering with the timestamp, epoch or
signature is rejected; the old constant token is rejected; an over-age token and
a future-dated token are rejected; a token valid a moment earlier is dead after
revoking, and a new one works. Then end to end against both running servers:
protected pages redirect when logged out, `/health` and `/webhooks/*` stay
public (gating them would fail every deploy and break Trainerize), the delay
escalates 1s/2s/3s, the kill switch locks a live cookie out, logging back in
works, and revoking one app does not touch the other.

### Not done

Two-factor authentication. Worth revisiting, but the four fixes above close the
gaps that actually existed.

---

## "Log out everywhere" in the Coach Portal (August 2026)

**What it does:** Coach's Corner - Settings now has a "Your account" section with
"Log out" (this browser only) and "Log out everywhere" (every device, including
the one being used). The second asks for confirmation first.

**Why there was nothing to build server-side:** the kill switch itself already
existed from the session security work - `POST /logout-everywhere` bumps the
epoch in `auth_epochs`. MyFitCoach Forms had a button for it; the portal had the
capability and no way to reach it, because its interface is a React app rather
than server-rendered pages. This was the missing button, not a missing feature.

**Why a plain form POST rather than fetch:** the endpoint answers with a redirect
to the login page. A form submission lets the browser follow that redirect
naturally. It is also the same mechanism MyFitCoach Forms uses, so the two apps
behave identically.

**The login page now confirms it worked.** `/logout-everywhere` has always
redirected to `/login?revoked=1`, but the portal's login page ignored the flag
and rendered a plain login box - identical to what you get when a session simply
expires. So the button gave no evidence it had done anything. It now shows "All
devices have been logged out", matching MyFitCoach Forms.

---

## Content Security Policy - Coach Portal (August 2026)

**What it is, in plain terms:** a browser runs whatever code it finds on a page
and cannot tell ours from anyone else's. The policy is a list sent with every
response naming the only places code and styling may come from. The browser
refuses everything else.

**Why it matters here specifically:** text nobody at MyFitCoach wrote does reach
these pages. The check-in link is public by design, and `/webhooks/*` is
deliberately unauthenticated (a considered decision - see the August 2026 notes).
If any of that text ever contained something shaped like code, this is what stops
the browser running it.

**Where it lives:** `backend/lib/security-headers.js`, mounted above every route
in `server.js` so it also covers `/robots.txt` and the login page.

**Why its own file rather than inline in server.js:** `server.js` cannot be
started on a development machine to test anything. `startScheduler()` runs
unconditionally on boot and `.env` points at the live database, so five seconds
later a laptop would be sending real scheduled messages, real group posts and
real reminder DMs to real clients. Keeping the headers in their own module with
no database dependency means the policy can be served and exercised against the
real built bundle and the real login page without any of that. See "Running the
portal locally is not safe" below.

**Every source was checked against the real assets.** This matters more than
usual because the failure mode is silent: a policy that is too strict still
renders a normal-looking page while a button quietly does nothing.

| Directive | Allows | Because |
|---|---|---|
| `script-src` | `'self'` only | The production build puts all JavaScript in `/static/js/*.js`. The built `index.html` has one `<script src>` tag and nothing inline, so no nonce, hash or `'unsafe-inline'` is needed. |
| `style-src` | `'self'`, fonts.googleapis.com, a per-request nonce | `/static/css/*.css`, the Google Fonts stylesheet, and exactly one inline `<style>` - the login page. |
| `font-src` | fonts.gstatic.com | The Google Fonts *stylesheet* comes from googleapis but the font *files* come from gstatic. Allowing only the first gives text with no DM Sans. |
| `img-src` | `'self'`, `data:`, api.trainerize.com | Logo and favicon; the preview shown when attaching a file in Messages plus an inline SVG background in the built CSS; image attachments in message threads. |
| `media-src` | api.trainerize.com | Video attachments render in a `<video>` element pointed at the Trainerize file API. Easy to miss - covered by neither `img-src` nor `connect-src`. |
| `connect-src` | `'self'` | Every API call is same-origin. Trainerize is only ever called from the server. |

Links out to Loom, MyFitnessPal and bit.ly need no entry. CSP does not restrict
where an `<a href>` points, only what a page loads and runs.

**Why a nonce for the login page rather than a hash:** the login page is a
self-contained template in `auth.js` with its CSS inline. A hash of that CSS
would go stale the moment anyone edited it, and the page would silently lose all
its styling. A fresh nonce per request cannot go stale.

**React's `style={{...}}` prop is unaffected.** It sets styles through the CSSOM,
which CSP does not police. Only literal `style="..."` attributes in served HTML
and `<style>` blocks are covered.

**`reportOnly` exists but is unused here.** It sends the policy as
`Content-Security-Policy-Report-Only`, where the browser reports what it would
have blocked and blocks nothing. The portal is used only by Connor, where a
mistake costs a refresh. It is there for MyFitCoach Forms, where a mistake lands
on a client mid-check-in and should be watched before it is enforced.

### Verified

Served through the real middleware with the real built bundle and the real login
page. The login page renders fully styled (proving the nonce works - without it
the page would be bare HTML), DM Sans downloads from gstatic, the dashboard
bundle loads and runs, and the console is clean on both.

Then each source individually: Trainerize images, Trainerize video, the `data:`
file preview and our own logo all load with no violation; an outside script, an
outside image and an inline style without the nonce are all blocked. The nonce
differs on every request.

### Not done here

MyFitCoach Forms. Deliberately deferred to the forms redesign rather than done
now, for two reasons. Switching an enforcing policy on before a redesign leaves a
tripwire across it - new styling written the old way would be silently blocked.
And the preparatory work (lifting the inline styles and script out of
`public/checkin.html` into their own files, and converting seven inline handlers
in `routes/admin.js`) is the same tidying the redesign wants doing first anyway,
so it belongs at the start of that work, with the policy written against the
finished forms at the end of it.

---

## The scheduler is off unless switched on (August 2026)

**The problem.** `backend/server.js` used to call `startScheduler()` from the
`app.listen` callback with no guard, and `.env` points at the live Railway
database. Five seconds after boot it ran `processScheduledMessages`,
`processScheduledPosts`, `processReminders`, `maybeReconcileClients` and
`maybeRunBackup`.

Started on a laptop, that meant real DMs and real group posts going to real
clients through Trainerize, from a second worker competing with the deployed one
for the same pending rows. `reminder_logs` deduplicates reminders, but a pending
scheduled message picked up by both instances could be sent to the client twice.

The `portal-auth-test` entry in `.claude/launch.json` did exactly this. It sets a
local password and secret, which makes it look safe, but it changed neither the
database nor the scheduler.

**The fix.** `SCHEDULER_ENABLED` must be exactly `true` for anything automatic to
run. Anything else, including leaving it unset, starts the server normally and
sends nothing.

**Restarts were never the problem, and still are not.** The scheduler only acts
on items whose send time has already passed; a restart catches up on what became
due while it was down and leaves everything future alone. That behaviour is
unchanged. The risk was only ever two instances running at once.

**Why off by default, which is the riskier-looking choice.** If the variable goes
missing in Railway, nothing sends. That is weighed against the alternative, where
the mistake is invisible and lands on clients instead of in a log. A silent
non-send is recoverable and would be noticed within a week. A client receiving
the same message twice cannot be undone.

Three things make the "forgot to set it" case survivable:

- the startup banner is impossible to miss in the deploy logs;
- `/health` reports `"scheduler": "on"` or `"off"`, checkable in a browser;
- it is a variable Connor sets himself, unlike `NODE_ENV`, which was
  platform-provided and vanished on its own. That distinction is the whole
  reason this is judged safe rather than a repeat of the NODE_ENV mistake
  above.

**Deploy note.** `SCHEDULER_ENABLED=true` must be set on the Railway portal
service BEFORE this ships, or the first deploy silently stops every scheduled
message, reminder and nightly backup.

### Verified

Started the real `backend/server.js` against the real `.env` with the variable
unset. The banner printed, no `[Scheduler] Started` line appeared, `/health`
returned `{"status":"ok","scheduler":"off"}`, and twelve seconds of running
produced no scheduler activity at all - the five-second startup burst that would
previously have sent the queue never happened.

## Check-in Mode - the presentation view (August 2026)

The Coach Portal Overview was built to hold data, and it holds it well. But the
Overview is not what a check-in Loom needs. Recording against it meant scrolling
between six sections, and every trend on the page - the 8-week bars behind each
score, the total score line, every chart tooltip - only rendered on
`onMouseEnter`. Hover content is effectively invisible on a screen recording: it
flickers, it follows a wobbling cursor, and it is gone before a viewer reads it.
So the most useful numbers in the portal were the ones clients never saw.

Check-in Mode (`frontend/src/components/CheckinMode.js`) is a full-screen view
that sits over the Overview and presents the same data as five fixed panels,
stepped through with the keyboard:

1. **The week** - total score, band label, week-over-week delta, the 7 category
   scores, and the total-score trend **pinned open rather than hovered**.
2. **What you told me** - the answered follow-ups, biggest win, help request and
   upcoming notes, at sizes that survive video compression.
3. **The numbers** - weight trajectory with its band, steps, sleep, and the
   3-week average weight comparison.
4. **The work** - the last 14 days as a grid, plus strength counts and cardio.
5. **This week's focus** - the focus editor, full width.

Opened with the header button or `P`, closed with `Esc`. Arrow keys, space and
`1`-`5` move between panels.

### Decisions worth recording

**No new endpoints.** Every panel is built from data `ClientOverviewTab` has
already fetched and passes down as props. Opening the mode costs nothing except
the calendar fetch below.

**The 14-day strip fetches its own months.** The Overview only ever holds the
single month its calendar is showing, so a 14-day window opened early in a month
would have been half empty. On open, Check-in Mode fetches every month the
window touches (one or two requests, in parallel) and merges them over whatever
the Overview already had, so the strip is seeded instantly and then completes.
Step counts come from `health`, which the calendar does not carry; everything
else comes from the calendar days.

**Dates are anchored at midday UTC.** `lastNDays` walks back in 86,400,000ms
steps from `T12:00:00Z`. Anchoring at midnight would let an Irish summer-time
switch roll a date backwards by an hour and drop or duplicate a day.

**Deltas compare check-ins, not calendar weeks.** The delta on each score is
`checkins[checkinIndex]` against `checkins[checkinIndex + 1]` - the two most
recent submissions, whichever weeks they landed in. A client who skips a week
gets a real comparison rather than a blank.

**The trend is truncated to the check-in on screen.** When an older check-in is
selected, `scoreTrend` is sliced to end at that week, so a past week is never
shown alongside data the client had not produced yet.

**Score colours are tinted cards, not solid fills.** The Overview's filled
circles put white text on `#fcd34d`, which fails contrast badly and turns to
mush under video compression. Check-in Mode uses a light tint with dark ink of
the same hue, plus a colour bar on top. Same traffic-light read, legible on a
phone. Stress stays inverted (`11 - value`) as everywhere else.

**Band maths moved to `frontend/src/components/shared/trajectory.js`.** The
trajectory band was calculated inline in `ClientOverviewTab`. Both views now
call `buildTrajectoryChart`, so the Overview chart and the Check-in Mode chart
cannot drift apart on how a band is drawn.

**Focus edits write through the existing endpoint.** The panel 5 textarea saves
to `PUT /api/overview/:id/focus` on the same 800ms debounce as the Overview's
focus box, then calls back so the Overview behind it re-fetches and the two
never disagree.

**Escape is two-stage.** In the focus field, `Esc` blurs the textarea; pressed
again it exits the mode. Otherwise a mistyped note would close the whole
presentation mid-recording.

Page scroll is locked while the mode is open, and the keyboard hints fade after
four seconds so they are not sitting in the recording, returning on mouse move.

## Training progression on one load scale (August 2026)

### The problem

Progress was read off `weight x reps`. Across 9,384 tracked workouts and 481
distinct exercises, that is wrong or meaningless for most of the programs:

- **85 exercises, 7,178 logged instances, log reps only.** Chin-ups, push-ups,
  pull-ups, inverted rows. They carry `recordType: strength`, so they passed the
  filter into `calcTotalVolume` and then contributed `0 x reps = 0`. Sessions
  built on them reported near-zero volume while the per-exercise cells went
  green, so the same screen contradicted itself.
- **Assisted movements reported backwards.** On an assist machine or band the
  logged number is the ASSISTANCE. Volume was computed as `assistance x reps`,
  so a client dropping from 40kg to 30kg of help - a clear progression - showed
  a volume fall and coloured red. Roughly 518 logged instances.
- **Loaded carries discarded the load.** `Single arm farmers carry` is
  `timedStrength`, which `classifyExercise` matched before it looked at weight,
  so 32kg for 40s and 24kg for 40s compared as identical.
- **Exercise type was decided by whichever session loaded first**, with a
  one-way bodyweight to weighted upgrade and no way back. `Plank` is logged six
  different ways across 811 instances; `Neutral grip chin up` 561 times without
  weight and 186 with. One arbitrary session set the rule for all the others,
  and once a dip belt appeared, every later bodyweight session compared against
  it at zero volume and read as a regression.

### The rule now

Load is resolved per set, on one kilogram scale, from the movement's load mode:

| Mode | Load |
|---|---|
| `external` | logged weight |
| `bodyweight` | bodyweight |
| `bodyweight_added` | bodyweight + logged weight |
| `bodyweight_assisted` | bodyweight - logged weight |
| `reps_only`, `timed`, `timed_loaded`, `cardio`, `ignore` | no single load figure |

This is arithmetic, not modelling. There is no estimated 1RM anywhere: those
equations assume a set taken to failure, and under the RIR method reps in
reserve float by design and are not recorded, so the same logged numbers could
sit 10kg apart in true capacity. That is a presumption, not an estimate, so it
is not calculated.

### Mode is set by the coach, never inferred

`exercise_load_modes` (coach_id, exercise_name, mode) holds the answer.
`suggestMode` produces a suggestion with a confidence and a reason, but it never
applies itself, and an exercise with no mode is left out of progression rather
than guessed at. The reason is that `bodyweight_added` and `bodyweight_assisted`
put a number in the same field with opposite meaning, so a wrong guess inverts
the result on exactly the movements it matters most for. "Assisted Single Leg
RDL" is the worked example: the name matches the assisted pattern, but the
logged weight there is the dumbbell, not assistance.

The setup panel pre-selects only high-confidence, non-signal-critical
suggestions. The bodyweight family is deliberately left blank so a single click
cannot bulk-accept a hundred guesses. 26 exercises across the roster fall in the
signal-critical group.

### Bodyweight lookup

Nearest weigh-in within 7 days of the session, otherwise nothing. Reaching
further back would put a fake load on every bodyweight movement. Coverage is
89.2% of bodyweight-family instances.

### Comparison

Each mode declares its own primary variable, because the coached variable
differs: load on a barbell row, reps on a pull-up (bodyweight drifts on its own,
so calling a 0.4kg weigh-in change "load down" would be noise), assistance going
down on an assist machine. Where the primary variable holds, reps at the top
load are the tie-break, which is what double progression looks like.

States are named for what changed, not whether it was good - `load_up`,
`reps_down`, `assist_down`, `held` - and a reduction is styled as worth-a-look
rather than as failure, because under autoregulation a lighter session is often
the right call.

Two things the old colouring got wrong are now explicit:

- **Sessions where the exercise was programmed but nothing logged** are kept in
  the series marked `logged: false` and stepped over when comparing. Treating a
  blank as a light session produced a false regression and then a false gain the
  week after.
- **Comparisons across more than 21 days** are still made but flagged
  `longGap`, so a comeback session is not read as a week-on-week move.

When no honest comparison exists the result is `not_comparable` with a reason,
never a fabricated verdict. Across the full history 78% of comparisons produce a
verdict; the remaining 22% break down as sessions not logged, first session of a
series, no weight logged, assistance not logged, and no weigh-in near the date.
