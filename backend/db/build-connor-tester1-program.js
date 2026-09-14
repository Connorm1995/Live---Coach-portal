#!/usr/bin/env node
/**
 * One-off script: build the "Tester 1" block for Connor Meyler.
 *
 * Connor asked on 13 Sep 2026 for a 3 day full body block with extra quad and
 * arm volume, heavy compounds at 6-10 reps and isolation at 10-15, built from
 * what actually progressed across his last four blocks.
 *
 * He had already created the training plan himself (id 38843876, "Tester 1",
 * 21 Sep to 18 Oct 2026, empty). This fills it and puts the sessions on his
 * calendar for Mon/Wed/Fri.
 *
 * THE EVIDENCE. 51 logged sessions, Sep 2025 to Apr 2026, across:
 * Powerbuilding, 5 day lower volume higher intensity, 5 day split, and the
 * current Training phase. Ranked by peak estimated 1RM gain:
 *
 *   Progressed:  bench +32% (80x5 to 100x7, 17 sessions), pec dec +83%,
 *                landmine press +44%, incline curls +40%, leg extensions +31%,
 *                front squat +29%, 1 arm rows +29%, bulgarian split squat +28%,
 *                preacher curl +25%.
 *   Stalled:     low bar squat +9%, smith squat +3%, quad leg press 0%,
 *                romanian deadlift +2%, rope pushdowns 0%, lying leg curl 0%.
 *
 * So the block squats with the FRONT squat, not the bar squats: that is where
 * his quad progress actually came from. Low bar is dropped.
 *
 * VOLUME. Quads 15 sets/week, biceps 12 direct, triceps 9 direct on top of the
 * pressing. Everything else sits at 6-11, enough to hold while those two push.
 *
 * VIDEOS. Connor's rule is his own uploads, never stock. Every exercise here
 * was verified with /exercise/get: all type 'custom', all carrying media.
 * "Tricep dip machine" (17302159) is his but has NO video, so rope pushdowns
 * replaced it. Every ID is reused from his own logged history so his "previous
 * / beat this" cards stay attached - never name-matched, which would create a
 * duplicate library entry and orphan the history.
 *
 * TWO API SHAPES, deliberately not shared:
 *   /workoutDef/add   builds the workout inside the training plan.
 *   /dailyWorkout/set puts a copy on a calendar date (status 'scheduled').
 * The docs disagree on casing between them, so each is written to its own
 * documented shape rather than one shared builder.
 *
 * THE CALENDAR (fixed 14 Sep 2026). On 13 Sep every /dailyWorkout/set call
 * returned `404: User not found`. The cause: each dailyWorkouts[] item needs its
 * OWN `userID`, which the docs never show. The top-level one alone is not
 * enough. Items are also sent with `workoutID` (the plan def id), which links
 * the calendar entry to the plan workout the same way scheduling in the app
 * does. Day 1 on 21 Sep was placed by the one-off test that proved this; this
 * script skips that date and fills the rest.
 *
 * Dry run is the default. Nothing is written without --commit.
 * Idempotent: refuses to add defs if the plan already has any, and skips any
 * calendar date that already holds a workout.
 *
 * Usage:
 *   node backend/db/build-connor-tester1-program.js
 *   node backend/db/build-connor-tester1-program.js --commit
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const am = require('../lib/auto-messages');

const USER_ID = 5346208;          // Connor Meyler in Trainerize
const PLAN_ID = 38843876;         // "Tester 1", 2026-09-21 .. 2026-10-18
const BLOCK_START = '2026-09-21'; // Monday
const BLOCK_END = '2026-10-18';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Weekday rotation: Day 1 Monday, Day 2 Wednesday, Day 3 Friday.
const DAYS = [
  {
    name: 'Day 1 - Quad Drive',
    weekday: 1,
    exercises: [
      { id: 8923856,  name: 'Front squat',                          sets: 4, target: '6-8 reps',             rest: 180 },
      { id: 9845775,  name: 'Barbell bench press.',                 sets: 4, target: '6-8 reps',             rest: 180 },
      { id: 9352250,  name: '1 arm rows',                           sets: 3, target: '8-10 reps each side',  rest: 120 },
      { id: 8516670,  name: 'Leg extensions',                       sets: 3, target: '12-15 reps',           rest: 90  },
      { id: 8512261,  name: 'Dumbbell incline curls',               sets: 3, target: '10-12 reps',           rest: 75  },
      { id: 11330267, name: 'Tricep single arm overhead extension', sets: 3, target: '12-15 reps each side', rest: 75  },
      { id: 8563635,  name: 'Lying leg curl',                       sets: 3, target: '12-15 reps',           rest: 90  },
    ],
  },
  {
    name: 'Day 2 - Arm Volume',
    weekday: 3,
    exercises: [
      { id: 8160404,  name: 'Trap bar deadlift',                                   sets: 3, target: '6-8 reps',            rest: 180 },
      { id: 8791035,  name: 'Smith machine incline press',                         sets: 4, target: '8-10 reps',           rest: 150 },
      { id: 8045929,  name: 'Neutral grip lat pulldowns',                          sets: 3, target: '8-10 reps',           rest: 120 },
      { id: 11288820, name: '[Supported] Contralateral bulgarian split squat',     sets: 4, target: '10-12 reps each side', rest: 90 },
      { id: 10354415, name: 'Close grip barbell bench press',                      sets: 3, target: '8-10 reps',           rest: 120 },
      { id: 11063688, name: 'Single arm preacher curl',                            sets: 3, target: '10-12 reps each side', rest: 75 },
      { id: 9234646,  name: 'Bicep cable curls',                                   sets: 3, target: '12-15 reps',          rest: 60  },
    ],
  },
  {
    name: 'Day 3 - Full Power',
    weekday: 5,
    exercises: [
      { id: 8030110,  name: 'Quad Focused Leg Press',              sets: 4, target: '8-10 reps',   rest: 150 },
      { id: 8029150,  name: 'Incline dumbbell chest press',        sets: 4, target: '8-10 reps',   rest: 150 },
      { id: 17292396, name: 'Seated Row Machine - Pronated Grip',  sets: 3, target: '10-12 reps',  rest: 90  },
      { id: 8029031,  name: 'Landmine shoulder press',             sets: 3, target: '8-10 reps',   rest: 90  },
      { id: 8024508,  name: 'Supinated dumbbell curls',            sets: 3, target: '10-12 reps',  rest: 75  },
      { id: 8030134,  name: 'Tricep Rope Pushdowns',               sets: 3, target: '12-15 reps',  rest: 60  },
      { id: 10086141, name: 'Leg press calf raises',               sets: 3, target: '12-15 reps',  rest: 60  },
    ],
  },
];

/** Every Mon/Wed/Fri inside the block, paired with the day that falls there. */
function schedule() {
  const out = [];
  const end = new Date(`${BLOCK_END}T00:00:00Z`);
  for (let d = new Date(`${BLOCK_START}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = DAYS.find((x) => x.weekday === d.getUTCDay());
    if (day) out.push({ date: d.toISOString().slice(0, 10), day });
  }
  return out;
}

/** /workoutDef/add - note lowercase `supersetID` on writes, per the docs. */
function planWorkoutPayload(day) {
  return {
    type: 'trainingPlan',
    trainingPlanID: PLAN_ID,
    workoutDef: {
      name: day.name,
      type: 'workoutRegular',
      instructions: '',
      exercises: day.exercises.map((e) => ({
        def: {
          id: e.id,
          sets: e.sets,
          target: e.target,
          targetDetail: { type: 10, text: e.target, distance: null, distanceUnit: null, time: null, zone: null },
          side: null,
          supersetID: 0,
          supersetType: 'none',
          intervalTime: 0,
          restTime: e.rest,
        },
      })),
    },
  };
}

/**
 * /dailyWorkout/set - capitalised `superSetID` here, per the docs. Built from the
 * def as Trainerize stored it. `userID` inside the item is required (undocumented).
 */
function dailyWorkoutPayload(date, def) {
  return {
    userID: USER_ID,
    unitWeight: 'kg',
    unitDistance: 'km',
    dailyWorkouts: [{
      id: 0,
      userID: USER_ID,
      workoutID: def.id,
      name: def.name,
      date,
      type: def.type,
      status: 'scheduled',
      style: 'normal',
      instructions: def.instruction || '',
      exercises: def.exercises.map((e) => ({
        dailyExerciseID: 0,
        def: {
          id: e.id, name: e.name, sets: e.sets, target: e.target, targetDetail: e.targetDetail,
          side: e.side, superSetID: e.superSetID, supersetType: e.supersetType,
          intervalTime: e.intervalTime, restTime: e.restTime, recordType: e.recordType,
        },
      })),
    }],
  };
}

async function run() {
  const commit = process.argv.includes('--commit');
  const plan = (await am.post('/trainingPlan/getList', { userid: USER_ID })).plans
    .find((p) => p.id === PLAN_ID);
  if (!plan) throw new Error(`Training plan ${PLAN_ID} not found on Connor's account`);

  const dates = schedule();
  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - "${plan.name}" (plan ${PLAN_ID})`);
  console.log(`  block      : ${plan.startDate} .. ${plan.endDate}`);
  console.log(`  sessions   : ${dates.length} on ${dates[0].date} .. ${dates[dates.length - 1].date}`);
  for (const d of DAYS) {
    const sets = d.exercises.reduce((t, e) => t + e.sets, 0);
    console.log(`  ${d.name.padEnd(20)} ${d.exercises.length} exercises, ${sets} working sets`);
  }
  if (dates[0].date !== BLOCK_START) throw new Error(`Expected to open on ${BLOCK_START}, got ${dates[0].date}`);
  if (dates.some((d) => d.date < plan.startDate || d.date > plan.endDate)) {
    throw new Error('A session falls outside the block. Refusing to schedule.');
  }

  // --- 1. The three workouts inside the block ------------------------------
  let existing = await am.post('/trainingPlan/getWorkoutDefList', { planID: PLAN_ID, start: 0, count: 50 });
  if (existing.total > 0) {
    console.log(`\n  step 1     : plan already holds ${existing.total} workout(s), leaving them alone`);
  } else if (commit) {
    for (const day of DAYS) {
      const res = await am.post('/workoutDef/add', planWorkoutPayload(day));
      console.log(`  step 1     : added "${day.name}" (${JSON.stringify(res).slice(0, 80)})`);
      await sleep(150);
    }
    existing = await am.post('/trainingPlan/getWorkoutDefList', { planID: PLAN_ID, start: 0, count: 50 });
  } else {
    console.log(`\n  step 1     : would add ${DAYS.length} workouts to the plan`);
  }
  const defs = Object.fromEntries((existing.workouts || []).map((w) => [w.name, w]));

  // --- 2. The calendar ------------------------------------------------------
  const cal = await am.post('/calendar/getList', {
    userID: USER_ID, startDate: BLOCK_START, endDate: BLOCK_END, unitWeight: 'kg',
  });
  const taken = new Set();
  for (const d of (cal.calendar || [])) {
    for (const it of (d.items || [])) {
      if (String(it.type).startsWith('workout')) taken.add(d.date);
    }
  }

  let created = 0, skipped = 0;
  for (const { date, day } of dates) {
    if (taken.has(date)) {
      console.log(`  ${date}  SKIP  already has a workout`);
      skipped++;
      continue;
    }
    if (!commit) {
      console.log(`  ${date}  would schedule  ${day.name}`);
      continue;
    }
    if (!defs[day.name]) throw new Error(`"${day.name}" is not in the plan, cannot schedule it`);
    await am.post('/dailyWorkout/set', dailyWorkoutPayload(date, defs[day.name]));
    console.log(`  ${date}  scheduled       ${day.name}`);
    created++;
    await sleep(150);
  }

  console.log('');
  if (commit) console.log(`Done. ${created} sessions scheduled, ${skipped} skipped.`);
  else console.log(`Dry run only. Nothing was written. Re-run with --commit to apply.`);
}

run().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
