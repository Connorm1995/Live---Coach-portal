# Logic Handbook

This document explains the reasoning behind every logic decision in the portal. Written so a non-technical person can read it and understand exactly why the portal behaves the way it does.

Last updated: March 2026

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
