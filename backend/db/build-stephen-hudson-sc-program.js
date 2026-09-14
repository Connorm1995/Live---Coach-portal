#!/usr/bin/env node
/**
 * One-off script: build the three S & C days for Stephen Hudson and put them on
 * his calendar.
 *
 * Connor asked on 14 Sep 2026 for a 3 day full body strength block. Stephen had
 * already been given the empty plan "S & C - Program 1" (id 38863945,
 * 14 Sep to 8 Nov 2026). This fills it with S & C - Day 1, 2 and 3, then
 * schedules them Tue / Thu / Sat, the days he gave at onboarding.
 *
 * THE BRIEF. Goal is fat loss (onboarding: drop 6-7kg, 88.5kg, intermediate,
 * no injuries, trains Tue/Thu/Sat). He will often run 2k to the gym, so the
 * sessions are 4-5 movements and not exhausting. Equipment is a GAA club gym:
 * barbells, dumbbells, racks, pull up bars, adjustable benches, trap bar,
 * bands, plyo box. No cables or machines, so nothing here needs them.
 *
 *   Day 1  box squat breaking parallel, banded pull ups 6-10, ab rollouts
 *   Day 2  trap bar deadlift
 *   Day 3  barbell bench, neutral eccentric pull ups 3-5 with a 3-5s lower,
 *          back supported knee raises
 *
 * Each day opens with the Full body warm up: 1 set, "5 minutes max, no need to
 * track this", no rest. The three main lifts rest 120s, everything else 90s.
 * Supersets follow Connor's existing pattern: the first exercise rests 0, the
 * second carries the 90s.
 *
 * Every exercise is type 'custom' with a ready video, checked with /exercise/get
 * on every run. Stephen has no logged history yet, so there are no history IDs
 * to reuse; each ID is the one Connor already uses in other clients' programs.
 * "Banded Pull Up" (11808166) and "Banded pull ups" (13274342) share one video;
 * 11808166 is the one on his most recent S & C Day 1 (Carlo Salizzo, Sep 2026).
 *
 * THE CALENDAR. /dailyWorkout/set needs `userID` inside EACH dailyWorkouts[]
 * item as well as at the top level. The docs only show the top-level one, and
 * without the inner one every item fails "404 User not found". Each item also
 * carries `workoutID` (the def id in the plan), which links the calendar entry
 * to the plan workout exactly as scheduling it in the app does. Verified on
 * Connor's own client account on 14 Sep 2026. See docs/logic.md.
 *
 * Dry run is the default. Nothing is written without --commit.
 * Safe to re-run: adds the days only if the plan is empty (or already holds
 * exactly these three, correct), and skips any date that already has a workout.
 *
 * Usage:
 *   node backend/db/build-stephen-hudson-sc-program.js
 *   node backend/db/build-stephen-hudson-sc-program.js --commit
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const am = require('../lib/auto-messages');

const USER_ID = 31291692;   // Stephen Hudson in Trainerize
const PLAN_ID = 38863945;   // "S & C - Program 1", 2026-09-14 .. 2026-11-08
const PLAN_NAME = 'S & C - Program 1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Connor's standard S & C instructions, word for word from his current programs.
const INSTRUCTIONS = 'Warm up:\n\nPlease start this session by following the full body warm up video (max 5 minutes)\n\nOnce complete, warm up for your first movement by performing the lift with a lighter weight for 2-3 sets, getting progressively closer to your "working weights" each set.\nThe aim of the warm up to get the nervous system firing, to improve blood flow and to grease the groove. Never go into your working weights cold.\n\nYou will need 1-3 warm up sets for every exercise you do and the number of warm ups depends on if you have any trouble spots or achy body parts, how heavy the working weight is going to be (the heavier the working weight, the more warming up you will have to do) and how well practised you are at the movement (a movement you are not used to might need an extra warm up set or two)\n\nThe cool down is simple, focus on getting your heart rate back down to normal levels by consciously deep breathing for 5 minutes after your session. \n';

const WARM_UP = { id: 15185657, name: 'Full body warm up', sets: 1, target: '5 minutes max, no need to track this', rest: 0 };
const MAIN = 120;
const REST = 90;

// weekday: 0 Sun .. 6 Sat. ss: exercises sharing a number are one superset;
// the last of the pair carries the rest.
const DAYS = [
  {
    name: 'S & C - Day 1',
    weekday: 2, // Tuesday
    exercises: [
      WARM_UP,
      { id: 10198237, name: 'Barbell box squat', sets: 3, rest: MAIN,
        target: '6-8 reps, controlled tempo - set the box so your hip crease finishes just below the top of your knee (breaking parallel). Sit back to the box under control, pause for a second without relaxing, then drive up' },
      { id: 11808166, name: 'Banded Pull Up', sets: 3, rest: 0, ss: 1,
        target: '6-10 reps, controlled tempo - start every rep from a full hang. Use a heavier band for more help, and move to a lighter band once you hit 10 reps on every set' },
      { id: 11282369, name: 'Half kneeling shoulder press', sets: 3, rest: REST, ss: 1,
        target: '8-10 reps each side, controlled tempo - squeeze the glute on the side of the knee that is down and keep your ribs down' },
      { id: 8092480, name: 'Dumbbell Romanian Deadlift', sets: 3, rest: REST,
        target: '8-12 reps, 3 seconds down - push the hips back, keep a proud chest and feel the stretch on your hamstrings' },
      { id: 8024502, name: 'Abb rollouts', sets: 3, rest: REST,
        target: '8-12 reps, controlled tempo - only roll out as far as you can without your lower back dropping' },
    ],
  },
  {
    name: 'S & C - Day 2',
    weekday: 4, // Thursday
    exercises: [
      WARM_UP,
      { id: 8160404, name: 'Trap bar deadlift', sets: 3, rest: MAIN,
        target: '6-8 reps, controlled tempo - brace hard before every rep, push the floor away and finish standing tall' },
      { id: 8029150, name: 'Incline dumbbell chest press', sets: 3, rest: 0, ss: 1,
        target: '8-12 reps, controlled tempo' },
      { id: 8024410, name: 'Dumbbell Chest Supported Row - Back - Rear delts - Biceps', sets: 3, rest: REST, ss: 1,
        target: '10-12 reps, controlled tempo - use the same incline bench as the press and keep your chest on the pad' },
      { id: 8098773, name: 'Reverse Lunge', sets: 3, rest: REST,
        target: '8-10 reps each side, controlled tempo' },
    ],
  },
  {
    name: 'S & C - Day 3',
    weekday: 6, // Saturday
    exercises: [
      WARM_UP,
      { id: 9845775, name: 'Barbell bench press.', sets: 3, rest: MAIN,
        target: '6-8 reps, controlled tempo - set the safety arms in the rack. Shoulder blades back and down, feet planted' },
      { id: 17292376, name: 'Neutral Grip Eccentric Pull Up', sets: 3, rest: REST,
        target: '3-5 reps, 3-5 seconds lowering - step or jump to the top, then lower yourself as slowly as you can to a full hang' },
      { id: 11288820, name: '[Supported] Contralateral bulgarian split squat', sets: 3, rest: 0, ss: 1,
        target: '8-10 reps each side, controlled tempo - hold a rack or upright bench for balance' },
      { id: 8024427, name: 'Dumbbell 1 arm row', sets: 3, rest: REST, ss: 1,
        target: '10-12 reps each side, controlled tempo' },
      { id: 8563351, name: 'Back Supported Knee Raises.', sets: 3, rest: REST,
        target: '10-15 reps, controlled tempo - no swinging, bring the knees up towards your chest and lower slowly' },
    ],
  },
];

/** Today's date in Dublin, YYYY-MM-DD. Never schedule into the past. */
function dublinToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
}

const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Every Tue/Thu/Sat from the later of block start and today, to block end. */
function schedule(plan) {
  const from = plan.startDate > dublinToday() ? plan.startDate : dublinToday();
  const out = [];
  const end = new Date(`${plan.endDate}T00:00:00Z`);
  for (let d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = DAYS.find((x) => x.weekday === d.getUTCDay());
    if (day) out.push({ date: d.toISOString().slice(0, 10), weekday: dayOrder[d.getUTCDay()], day });
  }
  return out;
}

/** /workoutDef/add - lowercase `supersetID` on writes, per the docs. */
function planWorkoutPayload(day) {
  return {
    type: 'trainingPlan',
    trainingPlanID: PLAN_ID,
    workoutDef: {
      name: day.name,
      type: 'workoutRegular',
      instructions: INSTRUCTIONS,
      exercises: day.exercises.map((e) => ({
        def: {
          id: e.id,
          sets: e.sets,
          target: e.target,
          targetDetail: { type: 10, text: e.target, distance: null, distanceUnit: null, time: null, zone: null },
          side: null,
          supersetID: e.ss || 0,
          supersetType: e.ss ? 'superset' : 'none',
          intervalTime: 0,
          restTime: e.rest,
        },
      })),
    },
  };
}

/**
 * /dailyWorkout/set - built from the def as Trainerize stored it, so the calendar
 * copy matches the plan exactly. `userID` inside the item is required (undocumented).
 */
function scheduledWorkoutPayload(date, def) {
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

/** Everything that must hold before a single write is attempted. */
async function preflight() {
  const problems = [];
  const text = [INSTRUCTIONS, ...DAYS.flatMap((d) => [d.name, ...d.exercises.map((e) => e.target)])];
  if (text.some((t) => /[–—]/.test(t))) problems.push('an en or em dash is in the text');

  for (const day of DAYS) {
    const counts = {};
    for (const e of day.exercises) if (e.ss) counts[e.ss] = (counts[e.ss] || 0) + 1;
    for (const [ss, n] of Object.entries(counts)) {
      if (n !== 2) problems.push(`${day.name}: superset ${ss} has ${n} exercises`);
    }
    const working = day.exercises.length - 1;
    if (working < 4 || working > 6) problems.push(`${day.name}: ${working} movements, brief says 4-6`);
  }

  const ids = [...new Set(DAYS.flatMap((d) => d.exercises.map((e) => e.id)))];
  for (const id of ids) {
    const ex = await am.post('/exercise/get', { id });
    const want = DAYS.flatMap((d) => d.exercises).find((e) => e.id === id).name;
    const video = ex.videoStatus || (ex.media && ex.media.status);
    if (ex.name !== want) problems.push(`${id} is "${ex.name}", expected "${want}"`);
    if (ex.type !== 'custom') problems.push(`${id} "${ex.name}" is ${ex.type}, not one of Connor's own`);
    if (video !== 'ready') problems.push(`${id} "${ex.name}" video is ${video || 'missing'}`);
    await sleep(100);
  }
  return problems;
}

function printDay(day) {
  const sets = day.exercises.slice(1).reduce((t, e) => t + e.sets, 0);
  console.log(`\n  ${day.name}, ${dayOrder[day.weekday]}  (${day.exercises.length - 1} movements, ${sets} working sets)`);
  for (const e of day.exercises) {
    const tag = e.ss ? `SS${e.ss}` : '   ';
    console.log(`    ${tag}  ${e.sets} x  rest ${String(e.rest).padStart(3)}s  ${e.name}`);
  }
}

/** Compare the plan's stored workouts with DAYS. Returns problems and the defs by name. */
async function verifyPlan() {
  const list = await am.post('/trainingPlan/getWorkoutDefList', { planID: PLAN_ID, start: 0, count: 50 });
  const problems = [];
  const defs = {};
  if ((list.workouts || []).length !== DAYS.length) {
    problems.push(`plan holds ${(list.workouts || []).length} workout(s), expected ${DAYS.length}`);
  }
  for (const day of DAYS) {
    const w = (list.workouts || []).find((x) => x.name === day.name);
    if (!w) { problems.push(`${day.name} missing`); continue; }
    defs[day.name] = w;
    if ((w.instruction || '') !== INSTRUCTIONS) problems.push(`${day.name}: instructions differ`);
    if (w.exercises.length !== day.exercises.length) {
      problems.push(`${day.name}: ${w.exercises.length} exercises stored, ${day.exercises.length} sent`);
      continue;
    }
    day.exercises.forEach((e, i) => {
      const got = w.exercises[i];
      const sent = { id: e.id, sets: e.sets, target: e.target, restTime: e.rest, ss: e.ss ? 'superset' : 'none' };
      const back = { id: got.id, sets: got.sets, target: got.target, restTime: got.restTime,
        ss: got.superSetID ? got.supersetType : 'none' };
      if (JSON.stringify(sent) !== JSON.stringify(back)) {
        problems.push(`${day.name} #${i + 1}: sent ${JSON.stringify(sent)} got ${JSON.stringify(back)}`);
      }
    });
  }
  return { problems, defs, total: list.total || 0, names: (list.workouts || []).map((w) => w.name) };
}

/** Dates in the range that already hold any workout, mapped to what is there. */
async function workoutsOnCalendar(startDate, endDate) {
  const cal = await am.post('/calendar/getList', { userID: USER_ID, startDate, endDate, unitWeight: 'kg' });
  const taken = new Map();
  for (const d of (cal.calendar || [])) {
    for (const it of (d.items || [])) {
      if (String(it.type).startsWith('workout')) {
        taken.set(d.date, [...(taken.get(d.date) || []), it]);
      }
    }
  }
  return taken;
}

async function run() {
  const commit = process.argv.includes('--commit');
  const plan = ((await am.post('/trainingPlan/getList', { userid: USER_ID })).plans || [])
    .find((p) => p.id === PLAN_ID);
  if (!plan) throw new Error(`Training plan ${PLAN_ID} not found on Stephen Hudson's account`);
  if (plan.name !== PLAN_NAME) throw new Error(`Plan ${PLAN_ID} is "${plan.name}", expected "${PLAN_NAME}"`);

  const dates = schedule(plan);
  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - Stephen Hudson, "${plan.name}" (plan ${PLAN_ID})`);
  console.log(`  block : ${plan.startDate} .. ${plan.endDate}`);
  DAYS.forEach(printDay);

  const problems = await preflight();
  if (problems.length) {
    console.log('\nPREFLIGHT FAILED, nothing written:');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('\n  preflight : all exercises are Connor\'s own with ready videos, no dashes, supersets paired');

  // --- 1. The three workouts inside the block --------------------------------
  let state = await verifyPlan();
  if (state.total === 0) {
    if (commit) {
      for (const day of DAYS) {
        const res = await am.post('/workoutDef/add', planWorkoutPayload(day));
        console.log(`  added     : "${day.name}" (${JSON.stringify(res).slice(0, 80)})`);
        await sleep(200);
      }
      state = await verifyPlan();
      if (state.problems.length) {
        console.log('  MISMATCHES after adding, calendar left alone:');
        state.problems.forEach((p) => console.log(`    - ${p}`));
        process.exit(1);
      }
      console.log('  read back : every exercise, set, target, rest and superset matches what was sent');
    } else {
      console.log(`  plan      : empty, would add ${DAYS.length} workouts`);
    }
  } else if (state.problems.length === 0) {
    console.log('  plan      : already holds these three days, correct. Not adding again.');
  } else {
    console.log(`  plan      : already holds ${state.total} workout(s) (${state.names.join(', ')}) ` +
      'that do not match. Refusing to touch it.');
    state.problems.forEach((p) => console.log(`    - ${p}`));
    process.exit(1);
  }

  // --- 2. The calendar -------------------------------------------------------
  if (!dates.length) { console.log('\n  calendar  : no Tue/Thu/Sat left in the block'); return; }
  const taken = await workoutsOnCalendar(dates[0].date, dates[dates.length - 1].date);
  console.log(`\n  calendar  : ${dates.length} sessions, ${dates[0].date} .. ${dates[dates.length - 1].date}`);

  let created = 0, skipped = 0;
  for (const { date, weekday, day } of dates) {
    const already = taken.get(date);
    if (already) {
      console.log(`    ${date} ${weekday}  SKIP  already has ${already.map((i) => `"${i.title}"`).join(', ')}`);
      skipped++;
      continue;
    }
    if (!commit) {
      console.log(`    ${date} ${weekday}  would schedule  ${day.name}`);
      continue;
    }
    const def = state.defs[day.name];
    const res = await am.post('/dailyWorkout/set', scheduledWorkoutPayload(date, def));
    console.log(`    ${date} ${weekday}  scheduled       ${day.name} (daily workout ${(res.dailyWorkoutIDs || [])[0]})`);
    created++;
    await sleep(200);
  }

  if (!commit) {
    console.log(`\nDry run only. Nothing was written. Re-run with --commit to add the days and schedule them.`);
    return;
  }

  // --- 3. Read the calendar back ---------------------------------------------
  const after = await workoutsOnCalendar(dates[0].date, dates[dates.length - 1].date);
  const wrong = [];
  for (const { date, day } of dates) {
    if (taken.has(date)) continue;
    const items = after.get(date) || [];
    const ok = items.filter((i) => i.title === day.name && i.detail && i.detail.workoutID === state.defs[day.name].id);
    if (ok.length !== 1) wrong.push(`${date}: expected one "${day.name}", found ${JSON.stringify(items.map((i) => i.title))}`);
  }
  console.log('');
  if (wrong.length) {
    console.log('CALENDAR MISMATCHES:');
    wrong.forEach((w) => console.log(`  - ${w}`));
    process.exit(1);
  }
  console.log(`Done. ${created} sessions scheduled and read back, each linked to its plan workout. ${skipped} skipped.`);
}

run().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
