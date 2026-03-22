# features.md — Coach Portal (Connor Meyler)

Last updated: March 2026
Status: Source of truth for all features. Nothing gets built that isn't in this file.

---

## Portal Architecture — Top Level

The portal has two top-level tabs:

1. **Client View** — The main working area. One client on screen at a time. Contains the Check-in Hub overlay and the full client review screen.
2. **Coach's Corner** — Back-office area. Direct messaging and scheduled posts.

---

## Tab 1 — Client View

### 1.1 Check-in Hub

A discreet, coach-only trigger button tucked in the top-left corner of the client view screen. It is intentionally small and unobtrusive — invisible to clients watching a Loom recording. When clicked, it opens a full overlay panel.

#### Overlay Panel — What It Shows

- A list of all active clients
- Each client entry displays:
  - Client name
  - Program label: **My Fit Coach** (weekly check-in) or **My Fit Coach Core** (monthly End of Month Report)
  - Status colour:
    - 🔴 Red — check-in received but not yet responded to
    - 🟢 Green — check-in has been responded to
  - If no check-in has been received yet, the client is listed under the "Not Submitted" section

#### How "Responded" Is Determined

A check-in is marked as responded (green) automatically when Connor sends the pre-templated Loom DM via the built-in direct message button on the client's review screen. No manual toggle required.

#### Filters

The panel has a filter toggle at the top:
- All
- Check-ins only (My Fit Coach — weekly)
- End of Month Reports only (My Fit Coach Core — monthly)

#### Sub-tabs Inside the Panel

- **Pending** — check-ins received but not yet responded to (red)
- **Done** — check-ins that have been responded to (green)
- **Not Submitted** — clients who have not yet submitted their check-in or report for the current cycle

#### Deadlines

- My Fit Coach weekly deadline: 8:00pm Monday
- My Fit Coach Core monthly deadline: configurable per client
- Auto-reminder messages are sent to clients who miss their deadline
- Reminder timing is configurable by Connor in settings

---

### 1.2 Client Header

Displayed at the top of every client review screen. Always visible regardless of which tab is active.

**Left side:**
- Client name (large)
- Last check-in date
- Client tenure (how long they have been a client)
- Current phase: Recomp / Fat Loss / Building / Maintenance
- Total session count

**Right side:**
- **Loom button** — opens a pre-templated direct message addressed to the client:
  > "Hey [Name], thanks for checking in. Click the link below to see your end of week feedback."
  Connor pastes the Loom URL and hits send. Sending this message triggers the check-in as responded (green) in the Check-in Hub.

---

### 1.3 Client Review Tabs

Each client has five tabs:

1. Overview
2. Training
3. Nutrition
4. Calendar
5. Recovery *(placeholder — not built yet)*

---

## Tab: Overview

The primary check-in review screen. All data shown is from the **previous full week (Monday–Sunday)**. Current week data is never shown here.

---

### Score Block Row

Seven individual score blocks displayed in a horizontal row:

| Block | Source |
|---|---|
| Overall | Calculated from check-in form total |
| Training | Check-in form score |
| Nutrition | Check-in form score |
| Steps | Check-in form score |
| Sleep | Check-in form score |
| Digestion | Check-in form score |
| Stress | Check-in form score |

Each block is colour coded:
- 🟢 Green — on track
- 🟡 Amber — needs attention
- 🔴 Red — poor

**Total score badge** displayed separately (e.g. 35/45), top right of the score row.

**Hover interaction (all 8 elements — 7 blocks + total score badge):**
When Connor hovers over any score block or the total badge, a tooltip appears showing an 8-week trend graph for that specific metric across the last 8 check-ins. This allows Connor to spot consistency, improvement, or decline at a glance without clicking away.

---

### Check-in Form Summary Section

Pulled directly from the client's submitted Typeform check-in. Displayed in clearly labelled, readable cards:

- Biggest wins this week
- Stress source
- Where do you feel you need help
- Any upcoming events

---

### This Week's Focus

A freetext input box where Connor can write up to three priority focus points for the client. This is visible during the current check-in review and also visible when Connor opens the next week's check-in — so Connor can look back and see what was asked the previous week.

---

### Sleep Graph

- Source: Trainerize (future option: Oura)
- Data source is labelled clearly on the graph
- Shows last 10 days of sleep data
- Displays: hours in bed per night
- **Requested addition:** Also display sleep start time and wake time per night, to show sleep consistency pattern
- Style: bar or line graph, clean and readable

---

### Steps Graph

- Source: Trainerize
- Shows last 10 days of step count
- Client's step count target displayed as a reference line
- Target is adjustable per client (Connor can override it)
- **Requested addition:** Display the average step count over the last 10 days (currently missing from old portal)

---

### Training Compliance

- Number of weight training sessions checked off last week vs sessions programmed
- Number of cardio sessions checked off last week

---

### Nutrition Adherence

- For each day last week: green tick if client tracked at least 65% of their daily calories, blank/red if not
- Displayed as a 7-day row

---

### Weight Trajectory Graph

- Source: Trainerize body weight entries
- Line graph showing weight over time
- Time range toggle: 1 month / 3 months / 6 months / 1 year
- **Phase overlay:** When a client is in a gaining or fat loss phase, the graph displays a shaded band showing the minimum and maximum expected rate of change for that phase. Connor can see at a glance whether the client is tracking inside or outside the target range.

---

### Weekly Average Body Weight Comparison

Two side-by-side boxes:
- **Previous week average** — shows the average weight, number of weigh-ins it's based on, and the specific dates of those weigh-ins
- **Last week average** — same format
- Delta displayed between the two (e.g. +0.4 kg)

---

## Tab: Training

All data shown is from the **previous full week (Monday–Sunday)**.

---

### Session Calendar

- Displays the last two full weeks plus any days so far in the current week
- Each day shows:
  - Weight training sessions — name of session, scheduled vs completed status
  - Cardio activities — type, distance, duration
  - Sports/other activities — type, duration, estimated calorie burn
- Colour coding: scheduled (outline), completed (filled)

---

### Key Lifts Tracker

Connor sets target lifts per client in the backend. Each key lift shows:

- Exercise name
- Target type: 1 Rep Max / 5 Rep Max / 10 Rep Max
- Current best vs target weight
- Progress percentage toward goal (e.g. "80% of target")

Exercise options are pulled from exercises already in the client's Trainerize history — no manual entry of exercise names required.

---

### Current Training Block Progress

Displayed as a session-by-session grid for the current training block only.

Colour logic per session:
- **White** — Session 1 (baseline, start of block)
- **Green** — Improved vs previous session
- **Amber** — Same as previous session
- **Red** — Below previous session

Connor can toggle the comparison metric:
- **Total volume** (sets × reps × weight)
- **Max weight** (heaviest set per exercise)

At the bottom of this section: a trend line graph showing total volume lifted across all sessions in the current block. Trend line only — no bar charts. Previous blocks are excluded.

---

## Tab: Nutrition

All data shown is from the **previous full week (Monday–Sunday)**.

---

### MyFitnessPal Link

- A button or link at the top of the nutrition tab that opens the client's MyFitnessPal diary directly
- The diary URL is stored per client (manually entered if auto-pull is not possible)
- **Preferred:** if MyFitnessPal diary URL can be auto-associated with the client record, it should be
- Note: MyFitnessPal does not have an API — this is a direct link to the client's public diary only

---

### Goals vs Actuals

A clean, colour-coded comparison table:

| Macro | Goal | Last Week Actual | Difference |
|---|---|---|---|
| Calories | — | — | — |
| Protein | — | — | — |
| Fats | — | — | — |
| Carbs | — | — | — |
| Fibre | — | — | — |

**Smart averaging logic:**
- A day is only included in the weekly average if the client tracked at least 65% of their daily calories
- Days excluded from the average are listed explicitly (e.g. "Average based on Mon, Tue, Thu, Fri — Wed, Sat, Sun excluded due to insufficient tracking")

---

### Daily Breakdown

- A day-by-day breakdown for the last two full weeks plus the current week to date
- Each day is clickable to expand and show full macro detail
- Design must be visually clean, well-spaced, colour-coordinated, and easy to read on a Loom recording
- The old portal's version of this section (small, black and white, hard to read) is not acceptable — full redesign required

---

## Tab: Calendar

A sync verification view only. Connor uses this tab to confirm that data in the portal matches what the client sees in Trainerize. It is not used for scheduling or editing.

---

### Calendar View

- Month view, one client at a time
- Navigation: current month and the ability to go back to previous months
- Each day cell shows a clean summary of what happened — sessions, cardio, body stats logged
- Scheduled vs completed distinction is preserved from Trainerize data
- Design must be clean and minimal — no sidebars, no stats panels, no legend text, no promotional content
- Only Connor's branding (logo + client name) in the chrome — nothing else

---

## Tab: Recovery

**Placeholder only. Do not build yet.**

The tab appears in the navigation. Clicking it shows an empty state with a note that this section is coming soon. Reserved for future build, likely incorporating Oura ring data.

### Available Trainerize Data for Recovery Tab

The following data is already available via the Trainerize API and can be used when the Recovery tab is built:

- **Resting heart rate** - available via `POST /healthData/getList` with `type: 'restingHeartRate'`. Returns daily resting heart rate readings logged by the client's wearable or manual entry.
- **Body composition** - available via `POST /bodystats/get`. Returns body fat percentage and body measurements (e.g. waist, chest, hips) logged by the client.

---

## Tab 2 — Coach's Corner

### 2.1 Direct Messages

- Full direct message interface, one conversation per client
- Message history going back at least 3 months
- Ability to send new messages to any client
- Ability to schedule a message — set a future send date and time
- Scheduled messages are saved to the database immediately so they survive a server crash and are never lost
- Synced with Trainerize DM system

---

### 2.2 Scheduled Posts

- Interface for creating group posts to be sent to the Trainerize group feed
- Posts can be scheduled for a future date and time
- All scheduled posts are saved to the database immediately
- View of all upcoming scheduled posts with edit and delete options
- Sent post history

---

## Data Rules

- All tables include `coach_id` from day one
- All data shown on the Overview, Training, and Nutrition tabs reflects the **previous full week (Monday–Sunday)** — never the current week
- Trainerize API calls are **read-only** at all times — no writes via the portal
- Scheduled messages and posts must be persisted to the database at the time of creation, not at send time

---

## Not In Scope (Yet)

The following are noted for future builds but must not be added now:

- Oura ring integration (Recovery tab)
- Second coach login
- Client-facing login
- PDF exports
- End of Month Report builder
