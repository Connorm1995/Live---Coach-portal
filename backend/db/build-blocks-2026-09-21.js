#!/usr/bin/env node
/**
 * One-off script: build the next training block for four clients, starting
 * Monday 21 Sep 2026, the day after each of their current blocks ends.
 *
 * Connor asked on 17 Sep 2026 for four programs "in one shot". He reviewed them
 * the same day (Micheál to 12 weeks, Brian's Pallof press out for decline sit
 * ups) and asked for them to go in and onto each client's training days. So this
 * creates each new plan, fills it with its workouts, then schedules them.
 *
 * TRAINING DAYS come from how often each client has actually completed a session
 * on each weekday, counted from Trainerize's calendar (not the portal database,
 * whose copy of Martin's history is missing most of 2026). The counts behind
 * each choice are above each client's program.
 *
 *   Brian Caulfield   Program 3 - 2026            -> Program 4 - 2026
 *   Martin Farrell    Phase 2 - 2026              -> Phase 3 - 2026
 *   Micheál Mahon     Phase 4 - Upper body focus  -> Phase 5 - Upper body focus
 *   Joe O'Brien       Phase 3 - 3 day split       -> Phase 4 - 3 day split
 *
 * THE BRIEF, per client, is written above each program below.
 *
 * SHARED RULES (Connor's):
 * - Block instructions are copied from Gary Corley's "Phase 1 - Strength
 *   training", the one Connor knows is correct. Its single en dash ("3–4 RIR")
 *   becomes a hyphen, because no dashes other than hyphens go in front of clients.
 * - Every strength session carries Gary's workout instructions (the warm up and
 *   cool down text) and opens with the Full body warm up:
 *   "5 minutes max, no need to track this + Few minutes incline walking at
 *   moderate pace if cold".
 * - Only Connor's own exercises (type 'custom') with a ready video. Where a client
 *   has logged an exercise before, the ID is the one in their history, so their
 *   "previous / beat this" numbers stay attached.
 * - Supersets follow Connor's pattern: every exercise but the last in the group
 *   rests 0, the last carries the rest.
 *
 * BOTH TEXTS ARE CHECKED LIVE. Gary's plan is read on every run and must still
 * match the copies below, so an edit Connor makes to Gary's text is never
 * silently ignored. Martin's bomb proof back is checked against his current block
 * the same way, down to the plank's stored 30 second target.
 *
 * CREATING A PLAN. /trainingPlan/add takes {userid, plan:{name, startDate,
 * endDate, duration, durationType}}, the exact payload the Trainerize web app
 * sends from its "new training phase" dialog (gt.modules / gt.spa 8.37.0).
 * Instructions go in on the same call, and are set with /trainingPlan/set
 * {plan:{id, instruction}} if the read back shows they did not stick.
 *
 * THE CALENDAR. /dailyWorkout/set needs `userID` inside each dailyWorkouts[] item
 * and `workoutID` to link the entry to the plan workout (see docs/logic.md).
 * /calendar/getList returns "404 User not found" for some longer ranges, so the
 * calendar is read in 4 week pieces.
 *
 * Dry run is the default. Nothing is written without --commit.
 * Safe to re-run: a plan that already exists with this name is filled in only if
 * what it holds matches, never duplicated, and a client whose calendar already
 * has a different block after 20 Sep is refused. A date that already holds this
 * block's workout is left alone, and a date holding any other workout is skipped
 * and reported rather than doubled up.
 *
 * Usage:
 *   node backend/db/build-blocks-2026-09-21.js
 *   node backend/db/build-blocks-2026-09-21.js --client brian
 *   node backend/db/build-blocks-2026-09-21.js --commit
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const am = require('../lib/auto-messages');

const START = '2026-09-21'; // Monday
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gary Corley, whose instructions are the source for every block below.
const GARY = { userID: 31085547, planID: 38671656 };

const BLOCK_INSTRUCTIONS = "Week 1: find your baseline\nStart with manageable weights. New to these movements? Use this week to learn them. Returning to them? Re-establish where you're at.\n\nAlways start your first week intensity at 3-4 RIR (reps in reserve). Stop each set when you've got 3 or 4 good reps left in the tank. Challenging, but comfortably within your limits.\n\nWeek 2 onwards: push\nMove to 2-3 RIR. Noticeably harder, still not to failure.\n\nBeat the book\nEvery session, aim to improve on the last. One extra rep, or a small weight increase. Log everything so you always have a number to beat.\n\nLoad vs. reps\nOn big compounds (squats, deadlifts, rows, presses), adding 2.5kg is a small jump relative to the total, so add load freely.\n\nOn isolation work (curls, lateral raises, tricep extensions), that same 2.5kg is a big percentage jump and usually costs you form. Build reps for a few weeks first, then add load.\n\nSingle-arm / single-leg work\nLog one side only. 15 reps per side on a single-arm row = log 15, not 30.\n\nStart with your weaker side and match that number on your stronger side. That fixes imbalances instead of hiding them.";

const WORKOUT_INSTRUCTIONS = 'Warm up:\n\nPlease start this session by following the full body warm up video (max 5 minutes)\n\nOnce complete, warm up for your first movement by performing the lift with a lighter weight for 2-3 sets, getting progressively closer to your "working weights" each set.\nThe aim of the warm up to get the nervous system firing, to improve blood flow and to grease the groove. Never go into your working weights cold.\n\nYou will need 1-3 warm up sets for every exercise you do and the number of warm ups depends on if you have any trouble spots or achy body parts, how heavy the working weight is going to be (the heavier the working weight, the more warming up you will have to do) and how well practised you are at the movement (a movement you are not used to might need an extra warm up set or two)\n\nThe cool down is simple, focus on getting your heart rate back down to normal levels by consciously deep breathing for 5 minutes after your session. \n';

const WARM_UP = {
  id: 15185657, name: 'Full body warm up', sets: 1, rest: 0,
  target: '5 minutes max, no need to track this + Few minutes incline walking at moderate pace if cold',
};

// Cues used on more than one day, kept identical so the client reads one rule.
const FOREARM_CUE = '15-20 reps, very slow, very controlled - take 3-5 seconds to lower the dumbbell. Build these up slowly, keeping the elbow pain under a 3/10';
const SIDE_PLANK_CUE = "20-40 seconds each side - straight line from head to heels, don't let the hips sag. Drop the bottom knee to the floor if you need to make it easier";
const CLOSE_GRIP_CUE = '10-20 reps, controlled tempo *hands under shoulders, elbows travel back not out';

/*
 * Exercise fields: id and name (checked against /exercise/get), sets, rest in
 * seconds, target text. `ss` groups a superset (or `ssType: 'circuit'`), and
 * `targetDetail` overrides the default text target.
 */

// ---------------------------------------------------------------------------
// BRIAN CAULFIELD
// 3 day full body, about 45 minutes each, under time pressure. Golfer's elbow
// and rotator cuff issues (and sore thumbs in July). Each day stays in one or two
// parts of the gym: day 1 at one bench with dumbbells, day 2 at the trap bar then
// the cable station, day 3 on the machines. Carried from his last block: straps
// on every pull, external rotations and forearm curls. Barbell squats are out
// this block because holding the bar is a common irritant for both the elbow and
// the shoulder; leg press and split squats cover the legs instead. Decline sit
// ups finish day 2: Connor says he hates the kneeling Pallof press, and the
// calendar agrees (one set logged when it was last in his sessions, in August).
//
// Days: Mon, Wed, Fri. Every one of his 123 sessions in the last 12 months was
// on one of those three days, Day 1 always on a Monday.
// ---------------------------------------------------------------------------
const BRIAN = {
  key: 'brian',
  name: 'Brian Caulfield',
  userID: 14980096,
  previous: { id: 38135949, name: 'Program 3 - 2026' },
  plan: { name: 'Program 4 - 2026', weeks: 8 },
  days: { Mon: ['Strength - Day 1'], Wed: ['Strength - Day 2'], Fri: ['Strength - Day 3'] },
  workouts: [
    {
      name: 'Strength - Day 1',
      where: 'One bench and a set of dumbbells',
      exercises: [
        WARM_UP,
        { id: 8029150, name: 'Incline dumbbell chest press', sets: 3, rest: 0, ss: 1,
          target: '8-12 reps, 3 seconds down, 1 second up - palms facing each other and only come down as far as is comfortable on the shoulder' },
        { id: 8024410, name: 'Dumbbell Chest Supported Row - Back - Rear delts - Biceps', sets: 3, rest: 90, ss: 1,
          target: '*use lifting straps* 10-15 reps, controlled tempo - stay on the same incline bench as the press, chest on the pad' },
        { id: 11288820, name: '[Supported] Contralateral bulgarian split squat', sets: 3, rest: 0, ss: 2,
          target: '8-12 reps each side, controlled tempo - drop the bench to flat for your back foot and hold a rack or upright for balance' },
        { id: 13166725, name: 'Dumbbell external rotations', sets: 3, rest: 90, ss: 2,
          target: '12-15 reps each side, 2-3 seconds down, 1-2 seconds up - treat this like a prehab exercise. Start light, build slowly and stay within a comfortable range of motion' },
        { id: 8092480, name: 'Dumbbell Romanian Deadlift', sets: 3, rest: 0, ss: 3,
          target: '*use lifting straps* 8-12 reps, 3 seconds down, 1 second up - push the hips back and look for a big stretch on the hamstrings' },
        { id: 16824759, name: 'Dumbbell forearm curls', sets: 3, rest: 90, ss: 3, target: FOREARM_CUE },
      ],
    },
    {
      name: 'Strength - Day 2',
      where: 'Trap bar and landmine, then the cable station',
      exercises: [
        WARM_UP,
        { id: 8160404, name: 'Trap bar deadlift', sets: 3, rest: 0, ss: 1,
          target: '*use lifting straps* 6-8 reps, controlled tempo - start every rep from a dead stop, no bouncing' },
        { id: 8029031, name: 'Landmine shoulder press', sets: 3, rest: 90, ss: 1,
          target: "8-12 reps each side, controlled tempo - this is all about exposure without overdoing it. Stay upright and let the shoulder blade wrap around your rib cage at the top. Let me know if it's not agreeing with your shoulder" },
        { id: 8045929, name: 'Neutral grip lat pulldowns', sets: 3, rest: 0, ss: 2,
          target: '*use lifting straps* 10-12 reps, controlled tempo - handles about shoulder width' },
        { id: 16962407, name: 'Cable shoulder external rotation', sets: 3, rest: 90, ss: 2,
          target: '12-15 reps each side, controlled tempo - this is a rehab exercise, you should not be straining to finish it. If the lightest setting on the cable is too heavy, let me know' },
        { id: 8030084, name: 'Seated cable rows', sets: 3, rest: 0, ss: 3,
          target: '*use lifting straps* 10-12 reps, controlled tempo - neutral handle' },
        { id: 8908395, name: 'Decline sit up', sets: 3, rest: 60, ss: 3,
          target: '12-20 reps, controlled tempo - hold a weight plate on your chest once you hit the top of the rep range' },
      ],
    },
    {
      name: 'Strength - Day 3',
      where: 'The machines, then the back extension bench',
      exercises: [
        WARM_UP,
        { id: 8030110, name: 'Quad Focused Leg Press', sets: 3, rest: 0, ss: 1,
          target: '10-12 reps, controlled tempo' },
        { id: 16824759, name: 'Dumbbell forearm curls', sets: 3, rest: 90, ss: 1,
          target: `${FOREARM_CUE}. Keep a light dumbbell beside the leg press and do these between sets` },
        { id: 9189231, name: 'Machine chest press', sets: 3, rest: 0, ss: 2,
          target: "8-12 reps, controlled tempo - please let me know if these aren't grooving with the elbow or shoulder" },
        { id: 8558352, name: 'Seated leg curls (pad on thighs)', sets: 3, rest: 90, ss: 2,
          target: '10-15 reps, controlled tempo' },
        { id: 8166334, name: 'Back extensions', sets: 3, rest: 0, ss: 3,
          target: '12-15 reps, slow tempo - finish each rep by squeezing your glutes, not by arching your lower back' },
        { id: 12059544, name: 'Deadbug', sets: 3, rest: 60, ss: 3,
          target: '8-10 reps each side, controlled tempo - keep your lower back pressed into the floor throughout' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// MARTIN FARRELL
// Home: adjustable dumbbells (he has logged up to 25kg) and an adjustable bench.
// No injuries but a dicky lower back, so no unsupported bent over rows; rows are
// chest or hand supported, and the side plank is new. Same shape as his last
// block: two days, each in a longer and a shorter version, plus bomb proof back.
// Fresh variations of the same patterns, no major changes.
//
// The shorter version is the longer one cut down (3 sets, the quickest
// movements), not a different session, so whichever version he picks he is
// beating the same numbers. In his last block the short sessions were separate
// exercises, and he chose one 4 times in 17 weeks, too rarely to build a number
// to beat.
//
// Days: Wed and Sat, his two most common training days over the last 12 months
// (Sat 14, Wed 11, of 61 days). Saturday was his steady day last autumn and
// winter, the months this block runs. Each day gets the longer session, the
// shorter one and bomb proof back, so he picks; bomb proof back sat on every
// training day of his last block.
// ---------------------------------------------------------------------------
const MARTIN_DAY1_A = [
  { id: 8029150, name: 'Incline dumbbell chest press', rest: 0, ss: 1,
    target: '8-12 reps, 3 seconds down, 1 second up' },
  { id: 8024410, name: 'Dumbbell Chest Supported Row - Back - Rear delts - Biceps', ss: 1,
    target: '10-15 reps, controlled tempo *1 second pause at the top of each rep - same bench and incline as the press' },
];
const MARTIN_DAY2_A = [
  { id: 12817965, name: '1 arm row with a hold', rest: 0, ss: 1,
    target: '8-12 reps each side, controlled tempo with a 1 second pause at the top - hand and knee on the bench, keep your back flat' },
  { id: 11665429, name: 'Close grip push ups', ss: 1, target: CLOSE_GRIP_CUE },
];
const MARTIN_RDL = { id: 8092480, name: 'Dumbbell Romanian Deadlift',
  target: '8-12 reps, 3 seconds down, 1 second up - proud chest, push your hips back to the wall behind you and stop when you feel the stretch on your hamstrings. Please send video on week 1' };
const MARTIN_LATERALS = { id: 8046058, name: 'Dumbbell Lateral Raises', target: '12-15 reps, controlled tempo *fight gravity on the way down' };
const MARTIN_SIDE_PLANK = { id: 8667420, name: 'Side Plank', target: SIDE_PLANK_CUE };

const MARTIN = {
  key: 'martin',
  name: 'Martin Farrell',
  userID: 20050096,
  previous: { id: 37022481, name: 'Phase 2 - 2026' },
  plan: { name: 'Phase 3 - 2026', weeks: 18 },
  days: {
    Wed: ['Strength Day 1 (longer session)', 'Strength Day 1 (shorter session)', 'bomb proof back general prep'],
    Sat: ['Strength Day 2 (longer session)', 'Strength Day 2 (shorter session)', 'bomb proof back general prep'],
  },
  workouts: [
    {
      name: 'bomb proof back general prep',
      where: 'Floor',
      instructions: '',
      copyOf: { planID: 37022481, name: 'bomb proof back general prep' },
      exercises: [
        { id: 8030228, name: 'bird dog', sets: 3, rest: 0, ss: 1, ssType: 'circuit', target: '8 each side' },
        { id: 8030089, name: 'MFC Deadbug 2', sets: 3, rest: 0, ss: 1, ssType: 'circuit', target: '8 each side' },
        { id: 8054653, name: 'Bodyweight glute bridge', sets: 3, rest: 0, ss: 1, ssType: 'circuit', target: '15' },
        { id: 8029081, name: 'Plank', sets: 3, rest: 45, ss: 1, ssType: 'circuit', target: '',
          targetDetail: { type: 2, distance: null, distanceUnit: null, time: 30, text: null, zone: null } },
      ],
    },
    {
      name: 'Strength Day 1 (longer session)',
      where: 'Bench at an incline, then a step',
      exercises: [
        WARM_UP,
        { ...MARTIN_DAY1_A[0], sets: 4 },
        { ...MARTIN_DAY1_A[1], sets: 4, rest: 120 },
        { id: 8046055, name: 'Front foot elevated split squat', sets: 3, rest: 0, ss: 2,
          target: '8-12 reps each side, controlled tempo - front foot up on a step or a couple of weight plates, 2-4 inches is plenty' },
        { id: 11282369, name: 'Half kneeling shoulder press', sets: 3, rest: 90, ss: 2,
          target: '8-12 reps each side, controlled tempo - squeeze the glute on the side of the knee that is down and keep your ribs down' },
        { ...MARTIN_SIDE_PLANK, sets: 3, rest: 60 },
      ],
    },
    {
      name: 'Strength Day 1 (shorter session)',
      where: 'Bench at an incline',
      exercises: [
        WARM_UP,
        { ...MARTIN_DAY1_A[0], sets: 3 },
        { ...MARTIN_DAY1_A[1], sets: 3, rest: 90 },
        { id: 9196550, name: 'Goblet Squat', sets: 3, rest: 0, ss: 2,
          target: '10-15 reps, 3 seconds down, 1 second pause at the bottom' },
        { ...MARTIN_SIDE_PLANK, sets: 3, rest: 60, ss: 2 },
      ],
    },
    {
      name: 'Strength Day 2 (longer session)',
      where: 'Flat bench',
      exercises: [
        WARM_UP,
        { ...MARTIN_DAY2_A[0], sets: 3 },
        { ...MARTIN_DAY2_A[1], sets: 3, rest: 120 },
        { id: 8030042, name: 'Heels elevated goblet squat', sets: 3, rest: 0, ss: 2,
          target: '10-15 reps, 3 seconds down - heels elevated 1-2 inches, stay upright and let the knees travel forward' },
        { ...MARTIN_LATERALS, sets: 3, rest: 90, ss: 2 },
        { ...MARTIN_RDL, sets: 3, rest: 0, ss: 3 },
        { id: 9520460, name: 'Hammer curls', sets: 3, rest: 90, ss: 3, target: '10-15 reps, controlled tempo' },
      ],
    },
    {
      name: 'Strength Day 2 (shorter session)',
      where: 'Flat bench',
      exercises: [
        WARM_UP,
        { ...MARTIN_DAY2_A[0], sets: 3 },
        { ...MARTIN_DAY2_A[1], sets: 3, rest: 90 },
        { ...MARTIN_RDL, sets: 3, rest: 0, ss: 2 },
        { ...MARTIN_LATERALS, sets: 3, rest: 90, ss: 2 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// MICHEÁL MAHON
// Home: adjustable bench and dumbbells (14-14.5kg since mid August). Meniscus
// keyhole surgery about 5 weeks before 17 Sep 2026. His August report has him
// walking, cycling and aiming to run within weeks. He did split squats until
// 13 Aug, and since the op has skipped every lunge and split squat, only starting
// bodyweight single leg hip thrusts on 12 Sep. So the lower body is one gentle
// movement a day that keeps the knee bent no more than about 90 degrees (box
// squat to a chair, B stance RDL), no kneeling on the knee, no lunges, no
// jumping. Upper body focus, 5 movements a session including a core movement,
// 2 days a week as in his last three blocks. 12 weeks, Connor's call.
//
// Days: Sat and Sun, 29 of his 52 sessions in the last 12 months (Sat 15,
// Sun 14; next is Wed with 9). Back to back, which is how he trains.
// ---------------------------------------------------------------------------
const MICHEAL = {
  key: 'micheal',
  name: 'Micheál Mahon',
  userID: 27392535,
  previous: { id: 38155973, name: 'Phase 4 - Upper body focus' },
  plan: { name: 'Phase 5 - Upper body focus', weeks: 12 },
  days: { Sat: ['Strength Training - Day 1'], Sun: ['Strength Training - Day 2'] },
  workouts: [
    {
      name: 'Strength Training - Day 1',
      where: 'Bench at an incline, a kitchen chair',
      exercises: [
        WARM_UP,
        { id: 8029150, name: 'Incline dumbbell chest press', sets: 3, rest: 0, ss: 1,
          target: '8-12 reps, 3 seconds down, 1 second up' },
        { id: 13560332, name: 'Helms row', sets: 3, rest: 90, ss: 1,
          target: '10-15 reps, controlled tempo *1 second pause at the top of each rep - watch the video for the bench set up' },
        { id: 10227349, name: 'Goblet box squat', sets: 3, rest: 0, ss: 2,
          target: "10-15 reps, controlled tempo - sit back to a kitchen chair or box at knee height or a bit higher. Tap off it, don't plonk. Start with bodyweight or a light dumbbell and only lower the seat or add weight once the knee feels good the next day" },
        { id: 11172190, name: 'Arnold Press', sets: 3, rest: 90, ss: 2,
          target: '8-12 reps, controlled tempo - sit tall with the bench set upright' },
        { id: 10613142, name: 'Plank Pull Through', sets: 3, rest: 60,
          target: "8-10 pull throughs each side, moderate dumbbell - the goal here is complete rigidity, don't let the hips twist" },
      ],
    },
    {
      name: 'Strength Training - Day 2',
      where: 'Flat bench',
      exercises: [
        WARM_UP,
        { id: 12412583, name: 'B stance dumbbell RDL', sets: 3, rest: 0, ss: 1,
          target: '8-12 reps each side, 3 seconds down - most of the weight goes through the front leg, the back foot is just for balance. Keep a soft bend in the front knee and start light' },
        { id: 11665429, name: 'Close grip push ups', sets: 3, rest: 90, ss: 1,
          target: `${CLOSE_GRIP_CUE}. If getting up and down off the floor bothers the knee, put your hands up on the bench` },
        { id: 12817965, name: '1 arm row with a hold', sets: 3, rest: 0, ss: 2,
          target: '8-12 reps each side, controlled tempo with a 1 second pause at the top - if kneeling on the bench bothers the knee, keep both feet on the floor and just put your hand on the bench' },
        { id: 9520460, name: 'Hammer curls', sets: 3, rest: 90, ss: 2, target: '10-15 reps, controlled tempo' },
        { id: 8667420, name: 'Side Plank', sets: 3, rest: 60, target: SIDE_PLANK_CUE },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// JOE O'BRIEN
// Commercial gym, making great progress on Phase 3, so a freshen up rather than
// an overhaul: same structure and most of the same lifts, three new movements and
// new rep ranges on the big lifts.
// - High bar squat -> Hack squat. He logged one set of the squat all block
//   (6 sessions), so it is swapped for something he is more likely to do.
// - EZ bar tricep pushdown -> Overhead cable tricep extension. His pushdown had
//   stalled, and overhead extensions grew the triceps more than pushdowns when
//   compared head to head (Maeo et al., 2023).
// - Anchored bicep curls -> Dumbbell incline curls, training the biceps in a
//   stretched position. His anchored curls were stuck under the rep range.
// - Heavier ranges on bench, trap bar, leg press, lat pulldown, seated rows and
//   lying leg curls after a block of 8-15s.
//
// Days: Mon, Thu, Sat. His days moved about after he moved to the UK, so this
// block is the guide: Day 2 was on a Thursday 4 times out of 6 and Day 3 on a
// Saturday 3 out of 5. Day 1 split Monday and Tuesday 3 each, and Monday leads
// over the last 12 months (5 to 4).
// ---------------------------------------------------------------------------
const JOE = {
  key: 'joe',
  name: "Joe O'Brien",
  userID: 28476796,
  previous: { id: 38155420, name: 'Phase 3 - 3 day split' },
  plan: { name: 'Phase 4 - 3 day split', weeks: 8 },
  days: { Mon: ['S & C - Day 1'], Thu: ['S & C - Day 2'], Sat: ['S & C - Day 3'] },
  workouts: [
    {
      name: 'S & C - Day 1',
      where: 'Commercial gym',
      exercises: [
        WARM_UP,
        { id: 8516664, name: 'Hack squat', sets: 3, rest: 120,
          target: "8-10 reps, controlled tempo - do a couple of warm up sets getting progressively heavier before your working sets. *if your gym doesn't have a hack squat, use the smith machine" },
        { id: 9845775, name: 'Barbell bench press.', sets: 3, rest: 120, target: '5-7 reps, controlled tempo' },
        { id: 8791088, name: 'Chest supported rows', sets: 3, rest: 90, target: '8-12 reps, controlled tempo' },
        { id: 8037085, name: 'Dumbbell shoulder press', sets: 3, rest: 90, target: '8-12 reps, controlled tempo' },
        { id: 8791085, name: 'Wide grip lat pulldown', sets: 3, rest: 90, target: '8-12 reps, controlled tempo' },
        { id: 12841592, name: 'Overhead cable tricep extension', sets: 3, rest: 90,
          target: '*optional 10-15 reps, controlled tempo - pick whatever handle feels most comfortable for you' },
      ],
    },
    {
      name: 'S & C - Day 2',
      where: 'Commercial gym',
      exercises: [
        WARM_UP,
        { id: 8160404, name: 'Trap bar deadlift', sets: 3, rest: 120,
          target: '6-8 reps, controlled tempo - start every rep from a dead stop' },
        { id: 8030110, name: 'Quad Focused Leg Press', sets: 3, rest: 120,
          target: '1 x 6-8 reps, 2 x 10-12 reps, controlled tempo - first set is your heaviest, back off the weight for the next two' },
        { id: 8563635, name: 'Lying leg curl', sets: 3, rest: 90, target: '8-12 reps, 3 seconds down' },
        { id: 8029150, name: 'Incline dumbbell chest press', sets: 3, rest: 0, ss: 1,
          target: '8-12 reps, controlled tempo' },
        { id: 9352250, name: '1 arm rows', sets: 3, rest: 120, ss: 1, target: '8-12 reps each side, controlled tempo' },
        { id: 10086141, name: 'Leg press calf raises', sets: 3, rest: 90, target: '*optional 10-15 reps, controlled tempo' },
      ],
    },
    {
      name: 'S & C - Day 3',
      where: 'Commercial gym',
      exercises: [
        WARM_UP,
        { id: 17023333, name: 'Assisted Pull Up (Neutral Grip)', sets: 3, rest: 0, ss: 1,
          target: '6-10 reps, controlled tempo' },
        { id: 11282369, name: 'Half kneeling shoulder press', sets: 3, rest: 120, ss: 1,
          target: '8-12 reps each side, controlled tempo - bring the dumbbell over to the assisted pull up machine' },
        { id: 8030084, name: 'Seated cable rows', sets: 3, rest: 90, target: '8-12 reps, controlled tempo' },
        { id: 8092480, name: 'Dumbbell Romanian Deadlift', sets: 3, rest: 90, target: '8-12 reps, controlled tempo' },
        { id: 8516670, name: 'Leg extensions', sets: 3, rest: 90,
          target: '10-15 reps, controlled tempo - pause each rep at the top for 1 second' },
        { id: 8512261, name: 'Dumbbell incline curls', sets: 3, rest: 90,
          target: '10-15 reps, controlled tempo - let your arms hang straight down behind you for a full stretch at the bottom' },
      ],
    },
  ],
};

const CLIENTS = [BRIAN, MARTIN, MICHEAL, JOE];

// ---------------------------------------------------------------------------

/** YYYY-MM-DD plus n days. */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** How the plan is stored: N weeks from START, ending the day before week N+1. */
function planDates(weeks) {
  return { startDate: START, endDate: addDays(START, weeks * 7 - 1), duration: weeks, durationType: 'week' };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's date in Dublin, YYYY-MM-DD. Never schedule into the past. */
function dublinToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
}

/** Every training day in the block, from the later of block start and today, with its workouts. */
function scheduleFor(c) {
  const { startDate, endDate } = planDates(c.plan.weeks);
  const out = [];
  for (let d = startDate > dublinToday() ? startDate : dublinToday(); d <= endDate; d = addDays(d, 1)) {
    const weekday = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
    if (c.days[weekday]) out.push({ date: d, weekday, workouts: c.days[weekday] });
  }
  return out;
}

/** Workout items per date. Read in 4 week pieces: longer ranges can come back 404. */
async function calendarWorkouts(userID, startDate, endDate) {
  const byDate = new Map();
  for (let s = startDate; s <= endDate; s = addDays(s, 28)) {
    const e = addDays(s, 27) < endDate ? addDays(s, 27) : endDate;
    const cal = await am.post('/calendar/getList', { userID, startDate: s, endDate: e, unitWeight: 'kg' });
    for (const d of cal.calendar || []) {
      const items = (d.items || []).filter((it) => String(it.type).startsWith('workout'));
      if (items.length) byDate.set(d.date, items);
    }
    await sleep(150);
  }
  return byDate;
}

/**
 * /dailyWorkout/set - built from the def as Trainerize stored it, so the calendar
 * copy matches the plan exactly. `userID` inside the item is required (undocumented).
 */
function scheduledWorkoutPayload(userID, date, def) {
  return {
    userID,
    unitWeight: 'kg',
    unitDistance: 'km',
    dailyWorkouts: [{
      id: 0,
      userID,
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

function instructionsFor(w) {
  return w.instructions !== undefined ? w.instructions : WORKOUT_INSTRUCTIONS;
}

function targetDetailFor(e) {
  return e.targetDetail || { type: 10, distance: null, distanceUnit: null, time: null, text: e.target, zone: null };
}

/** Trainerize's own estimate: every set costs 60 seconds plus its rest. */
function estimateMinutes(w) {
  return Math.round(w.exercises.reduce((t, e) => t + e.sets * (60 + e.rest), 0) / 60);
}

/** /workoutDef/add - lowercase `supersetID` on writes, per the docs. */
function workoutPayload(planID, w) {
  return {
    type: 'trainingPlan',
    trainingPlanID: planID,
    workoutDef: {
      name: w.name,
      type: 'workoutRegular',
      instructions: instructionsFor(w),
      exercises: w.exercises.map((e) => ({
        def: {
          id: e.id,
          sets: e.sets,
          target: e.target,
          targetDetail: targetDetailFor(e),
          side: null,
          supersetID: e.ss || 0,
          supersetType: e.ss ? (e.ssType || 'superset') : 'none',
          intervalTime: 0,
          restTime: e.rest,
        },
      })),
    },
  };
}

/** A comparable fingerprint of one exercise, from our table or from a read back. */
function fingerprint(e, fromTrainerize) {
  const td = fromTrainerize ? (e.targetDetail || {}) : targetDetailFor(e);
  return JSON.stringify({
    id: e.id,
    sets: e.sets,
    target: e.target || '',
    rest: fromTrainerize ? e.restTime : e.rest,
    group: fromTrainerize ? (e.superSetID ? e.supersetType : 'none') : (e.ss ? (e.ssType || 'superset') : 'none'),
    tdType: td.type,
    tdTime: td.time == null ? null : td.time,
  });
}

/** Superset membership as positions, so renumbered group IDs still compare equal. */
function groups(exercises, fromTrainerize) {
  const byId = {};
  exercises.forEach((e, i) => {
    const g = fromTrainerize ? e.superSetID : e.ss;
    if (g) (byId[g] = byId[g] || []).push(i);
  });
  return JSON.stringify(Object.values(byId).sort((a, b) => a[0] - b[0]));
}

/** Differences between a workout as written here and as Trainerize stored it. */
function compareWorkout(w, stored) {
  const problems = [];
  if ((stored.instruction || '') !== instructionsFor(w)) problems.push(`${w.name}: instructions differ`);
  if (stored.exercises.length !== w.exercises.length) {
    problems.push(`${w.name}: ${stored.exercises.length} exercises stored, ${w.exercises.length} expected`);
    return problems;
  }
  w.exercises.forEach((e, i) => {
    const want = fingerprint(e, false);
    const got = fingerprint(stored.exercises[i], true);
    if (want !== got) problems.push(`${w.name} #${i + 1} ${e.name}: expected ${want} got ${got}`);
  });
  if (groups(w.exercises, false) !== groups(stored.exercises, true)) {
    problems.push(`${w.name}: superset groupings differ`);
  }
  return problems;
}

/** Checks on the tables themselves that need no network. */
function checkTables() {
  const problems = [];
  const dash = /[\u2012-\u2015\u2212]/;
  if (dash.test(BLOCK_INSTRUCTIONS) || dash.test(WORKOUT_INSTRUCTIONS)) problems.push('a dash other than a hyphen is in the instructions');
  for (const c of CLIENTS) {
    if (dash.test(c.plan.name)) problems.push(`${c.name}: dash in plan name`);
    const names = new Set();
    for (const w of c.workouts) {
      if (names.has(w.name)) problems.push(`${c.name}: two workouts called "${w.name}"`);
      names.add(w.name);
      if (dash.test(w.name)) problems.push(`${c.name}: dash in "${w.name}"`);
      w.exercises.forEach((e, i) => {
        if (dash.test(e.target)) problems.push(`${c.name} / ${w.name}: dash in the ${e.name} target`);
        for (const f of ['id', 'name', 'sets', 'rest']) {
          if (e[f] === undefined) problems.push(`${c.name} / ${w.name} #${i + 1}: missing ${f}`);
        }
        if (typeof e.target !== 'string') problems.push(`${c.name} / ${w.name} #${i + 1}: missing target`);
      });
      // Supersets: consecutive, 2 for a superset or 3+ for a circuit, and only the
      // last exercise in the group carries rest.
      const byGroup = {};
      w.exercises.forEach((e, i) => { if (e.ss) (byGroup[e.ss] = byGroup[e.ss] || []).push(i); });
      for (const [g, idx] of Object.entries(byGroup)) {
        const type = w.exercises[idx[0]].ssType || 'superset';
        if (idx[idx.length - 1] - idx[0] !== idx.length - 1) problems.push(`${c.name} / ${w.name}: group ${g} is not consecutive`);
        if (type === 'superset' && idx.length !== 2) problems.push(`${c.name} / ${w.name}: superset ${g} has ${idx.length} exercises`);
        if (type === 'circuit' && idx.length < 3) problems.push(`${c.name} / ${w.name}: circuit ${g} has ${idx.length} exercises`);
        idx.slice(0, -1).forEach((i) => {
          if (w.exercises[i].rest !== 0) problems.push(`${c.name} / ${w.name}: ${w.exercises[i].name} rests inside its superset`);
        });
      }
      if (w.exercises[0].id === WARM_UP.id && w.exercises[0] !== WARM_UP) problems.push(`${c.name} / ${w.name}: warm up altered`);
      if (w.instructions === undefined && w.exercises[0] !== WARM_UP) problems.push(`${c.name} / ${w.name}: does not open with the warm up`);
    }
    // Training days: real weekdays, real workouts, and every workout on the calendar somewhere.
    const scheduled = new Set();
    for (const [weekday, list] of Object.entries(c.days || {})) {
      if (!WEEKDAYS.includes(weekday)) problems.push(`${c.name}: "${weekday}" is not a weekday`);
      if (new Set(list).size !== list.length) problems.push(`${c.name}: ${weekday} lists a workout twice`);
      for (const n of list) {
        if (!names.has(n)) problems.push(`${c.name}: ${weekday} names "${n}", which is not in the block`);
        scheduled.add(n);
      }
    }
    for (const n of names) if (!scheduled.has(n)) problems.push(`${c.name}: "${n}" is never scheduled`);
  }
  return problems;
}

/** Live checks: Gary's texts, Martin's bomb proof back, every exercise's video. */
async function checkLive(clients) {
  const problems = [];

  const gary = ((await am.post('/trainingPlan/getList', { userid: GARY.userID })).plans || []).find((p) => p.id === GARY.planID);
  if (!gary) problems.push("Gary Corley's plan is gone, cannot confirm the instructions");
  else if ((gary.instruction || '').replace(/\u2013/g, '-') !== BLOCK_INSTRUCTIONS) {
    problems.push("Gary Corley's block instructions have changed since this script was written");
  }
  const garyDefs = await am.post('/trainingPlan/getWorkoutDefList', { planID: GARY.planID, start: 0, count: 50 });
  const garyTexts = new Set((garyDefs.workouts || []).map((w) => w.instruction || ''));
  if (garyTexts.size !== 1 || !garyTexts.has(WORKOUT_INSTRUCTIONS)) {
    problems.push("Gary Corley's workout instructions have changed since this script was written");
  }

  for (const c of clients) {
    for (const w of c.workouts.filter((x) => x.copyOf)) {
      const list = await am.post('/trainingPlan/getWorkoutDefList', { planID: w.copyOf.planID, start: 0, count: 50 });
      const source = (list.workouts || []).find((x) => x.name === w.copyOf.name);
      if (!source) problems.push(`${c.name}: "${w.copyOf.name}" not found in plan ${w.copyOf.planID}`);
      else compareWorkout(w, source).forEach((p) => problems.push(`${c.name}: copy differs from the original - ${p}`));
    }
  }

  const seen = new Map();
  for (const c of clients) for (const w of c.workouts) for (const e of w.exercises) seen.set(e.id, e.name);
  for (const [id, name] of seen) {
    const ex = await am.post('/exercise/get', { id });
    const video = ex.videoStatus || (ex.media && ex.media.status);
    if (ex.name !== name) problems.push(`${id} is "${ex.name}", expected "${name}"`);
    if (ex.type !== 'custom') problems.push(`${id} "${ex.name}" is ${ex.type}, not one of Connor's own`);
    if (video !== 'ready') problems.push(`${id} "${ex.name}" video is ${video || 'missing'}`);
    await sleep(100);
  }
  return { problems, exercisesChecked: seen.size };
}

function printClient(c) {
  const d = planDates(c.plan.weeks);
  console.log(`\n${'='.repeat(78)}\n${c.name}: "${c.plan.name}", ${d.startDate} to ${d.endDate} (${c.plan.weeks} weeks)`);
  for (const w of c.workouts) {
    const working = w.exercises.filter((e) => e.id !== WARM_UP.id);
    console.log(`\n  ${w.name}  [${w.where}]  ${working.length} movements, Trainerize estimate ${estimateMinutes(w)} min`);
    const letters = {};
    let next = 0;
    for (const e of w.exercises) {
      let tag = '   ';
      if (e.ss) {
        if (!letters[e.ss]) letters[e.ss] = { letter: 'ABCDEFG'[next++], n: 0 };
        letters[e.ss].n += 1;
        tag = `${letters[e.ss].letter}${letters[e.ss].n} `;
      }
      console.log(`    ${tag} ${e.sets} x  rest ${String(e.rest).padStart(3)}s  ${e.name}`);
      console.log(`             ${e.target || (e.targetDetail && e.targetDetail.time ? `${e.targetDetail.time} seconds` : '')}`);
    }
  }
}

/** Build (or finish building) one client's block. Returns {problems, defs}. */
async function buildClient(c, commit) {
  const want = planDates(c.plan.weeks);
  const plans = (await am.post('/trainingPlan/getList', { userid: c.userID })).plans || [];

  const prev = plans.find((p) => p.id === c.previous.id);
  if (!prev || prev.name !== c.previous.name) {
    return fail(`current block ${c.previous.id} "${c.previous.name}" not found, wrong client?`);
  }
  const clash = plans.filter((p) => p.name !== c.plan.name && p.endDate && p.endDate >= START);
  if (clash.length) {
    return fail(`already has a block running on or after ${START}: ${clash.map((p) => `"${p.name}" ${p.startDate}..${p.endDate}`).join(', ')}`);
  }

  let plan = plans.find((p) => p.name === c.plan.name);
  if (plan && plan.startDate !== want.startDate) {
    return fail(`a plan called "${c.plan.name}" already exists starting ${plan.startDate}`);
  }

  if (!plan) {
    if (!commit) {
      console.log(`  plan      : would create "${c.plan.name}" ${want.startDate}..${want.endDate}`);
      console.log(`  workouts  : would add ${c.workouts.length}`);
      return { problems: [], defs: null };
    }
    const res = await am.post('/trainingPlan/add', { userid: c.userID, plan: { name: c.plan.name, instruction: BLOCK_INSTRUCTIONS, ...want } });
    console.log(`  created   : plan ${res && res.id}`);
    await sleep(300);
    plan = ((await am.post('/trainingPlan/getList', { userid: c.userID })).plans || []).find((p) => p.name === c.plan.name);
    if (!plan) return fail('plan was not there when read back');
  } else {
    console.log(`  plan      : "${plan.name}" already exists (${plan.id}), checking it`);
  }

  const planProblems = [];
  for (const f of ['startDate', 'endDate', 'duration', 'durationType']) {
    if (plan[f] !== want[f]) planProblems.push(`plan ${f} is ${plan[f]}, expected ${want[f]}`);
  }
  if (planProblems.length) return fail(...planProblems);

  if ((plan.instruction || '') !== BLOCK_INSTRUCTIONS) {
    if (!commit) return fail('plan instructions differ from the block instructions');
    await am.post('/trainingPlan/set', { plan: { id: plan.id, instruction: BLOCK_INSTRUCTIONS } });
    await sleep(300);
    plan = ((await am.post('/trainingPlan/getList', { userid: c.userID })).plans || []).find((p) => p.id === plan.id);
    if ((plan.instruction || '') !== BLOCK_INSTRUCTIONS) return fail('instructions did not stick after /trainingPlan/set');
    console.log('  set       : block instructions (did not stick on create)');
  }
  console.log(`  read back : "${plan.name}" ${plan.startDate}..${plan.endDate}, ${plan.duration} ${plan.durationType}s, instructions match`);

  let stored = (await am.post('/trainingPlan/getWorkoutDefList', { planID: plan.id, start: 0, count: 50 })).workouts || [];
  const unknown = stored.filter((s) => !c.workouts.some((w) => w.name === s.name));
  if (unknown.length) return fail(`plan holds workouts this script did not write: ${unknown.map((s) => `"${s.name}"`).join(', ')}`);
  for (const s of stored) {
    const p = compareWorkout(c.workouts.find((w) => w.name === s.name), s);
    if (p.length) return fail(`"${s.name}" is already in the plan but differs, refusing to touch it`, ...p);
  }

  const missing = c.workouts.filter((w) => !stored.some((s) => s.name === w.name));
  if (!commit) {
    console.log(`  workouts  : ${stored.length} present and correct, would add ${missing.length}`);
    return { problems: [], defs: Object.fromEntries(stored.map((s) => [s.name, s])) };
  }
  for (const w of missing) {
    const res = await am.post('/workoutDef/add', workoutPayload(plan.id, w));
    console.log(`  added     : "${w.name}" (workout ${res && (res.workoutID || res.id)})`);
    await sleep(250);
  }

  stored = (await am.post('/trainingPlan/getWorkoutDefList', { planID: plan.id, start: 0, count: 50 })).workouts || [];
  const after = [];
  for (const w of c.workouts) {
    const s = stored.find((x) => x.name === w.name);
    if (!s) after.push(`"${w.name}" missing after adding`);
    else after.push(...compareWorkout(w, s));
  }
  if (stored.length !== c.workouts.length) after.push(`plan holds ${stored.length} workouts, expected ${c.workouts.length}`);
  if (!after.length) console.log(`  read back : all ${c.workouts.length} workouts match, every exercise, set, target, rest and superset`);
  return { problems: after, defs: Object.fromEntries(stored.map((s) => [s.name, s])) };
}

function fail(...problems) {
  return { problems, defs: null };
}

/**
 * Put the block on the client's training days. `defs` are the plan's workouts as
 * Trainerize stored them (null in a dry run before the plan exists).
 */
async function scheduleClient(c, defs, commit) {
  const dates = scheduleFor(c);
  if (!dates.length) {
    console.log('  calendar  : no training days left in the block');
    return [];
  }
  if (commit) {
    const missingDefs = [...new Set(dates.flatMap((d) => d.workouts))].filter((n) => !defs || !defs[n]);
    if (missingDefs.length) return [`cannot schedule, not in the plan: ${missingDefs.join(', ')}`];
  }
  const ours = (it) => defs && Object.values(defs).some((d) => it.detail && it.detail.workoutID === d.id);
  const first = dates[0].date;
  const last = dates[dates.length - 1].date;
  const before = await calendarWorkouts(c.userID, first, last);
  const total = dates.reduce((t, d) => t + d.workouts.length, 0);
  console.log(`  calendar  : ${Object.keys(c.days).join(', ')}. ${dates.length} days, ${total} workouts, ${first} .. ${last}`);

  let added = 0;
  let already = 0;
  const skippedDays = new Set();
  for (const { date, weekday, workouts } of dates) {
    const existing = before.get(date) || [];
    const other = existing.filter((it) => !ours(it));
    if (other.length) {
      skippedDays.add(date);
      console.log(`    ${date} ${weekday}  SKIP  already has ${other.map((it) => `"${it.title}"`).join(', ')}`);
      continue;
    }
    const line = [];
    for (const name of workouts) {
      const def = defs && defs[name];
      if (def && existing.some((it) => it.detail && it.detail.workoutID === def.id)) {
        already += 1;
        line.push(`${name} (already there)`);
        continue;
      }
      if (commit) {
        await am.post('/dailyWorkout/set', scheduledWorkoutPayload(c.userID, date, def));
        await sleep(200);
      }
      added += 1;
      line.push(name);
    }
    console.log(`    ${date} ${weekday}  ${commit ? 'scheduled' : 'would schedule'}  ${line.join('  +  ')}`);
  }
  console.log(`  calendar  : ${commit ? 'scheduled' : 'would schedule'} ${added}, already there ${already}, days skipped ${skippedDays.size}`);
  if (!commit) return [];

  // Read it all back: each day holds each of its workouts exactly once, linked to the plan.
  const after = await calendarWorkouts(c.userID, first, last);
  const wrong = [];
  for (const { date, workouts } of dates) {
    if (skippedDays.has(date)) continue;
    const items = after.get(date) || [];
    for (const name of workouts) {
      const hits = items.filter((it) => it.detail && it.detail.workoutID === defs[name].id && it.title === name);
      if (hits.length !== 1) wrong.push(`${date}: expected one "${name}", found ${hits.length} (${items.map((it) => it.title).join(', ') || 'nothing'})`);
    }
    const extra = items.filter((it) => ours(it) && !workouts.some((n) => it.detail.workoutID === defs[n].id));
    if (extra.length) wrong.push(`${date}: unexpected ${extra.map((it) => `"${it.title}"`).join(', ')}`);
  }
  if (!wrong.length) console.log(`  read back : every training day holds exactly its workouts, each linked to the plan`);
  return wrong;
}

async function run() {
  const commit = process.argv.includes('--commit');
  const only = process.argv.includes('--client') ? process.argv[process.argv.indexOf('--client') + 1] : null;
  const clients = only ? CLIENTS.filter((c) => c.key === only) : CLIENTS;
  if (!clients.length) throw new Error(`no client "${only}" (use ${CLIENTS.map((c) => c.key).join(', ')})`);

  console.log(`${commit ? 'APPLYING' : 'DRY RUN'} - next blocks starting ${START}, then each client's training days.`);
  clients.forEach(printClient);

  const tableProblems = checkTables();
  const { problems: liveProblems, exercisesChecked } = await checkLive(clients);
  const problems = [...tableProblems, ...liveProblems];
  if (problems.length) {
    console.log('\nPREFLIGHT FAILED, nothing written:');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log(`\nPreflight: ${exercisesChecked} exercises all Connor's own with ready videos, no dashes, supersets well formed,`);
  console.log("           Gary's instructions unchanged, bomb proof back identical to Martin's current one.");

  let failed = 0;
  for (const c of clients) {
    console.log(`\n--- ${c.name} (${c.userID})`);
    const { problems: built, defs } = await buildClient(c, commit);
    const p = built.length ? built : await scheduleClient(c, defs, commit);
    if (p.length) {
      failed += 1;
      console.log('  PROBLEMS:');
      p.forEach((x) => console.log(`    - ${x}`));
      if (commit) break; // stop before touching anyone else
    }
    await sleep(200);
  }

  if (failed) process.exit(1);
  console.log(commit
    ? '\nDone. Every block created, scheduled and read back.'
    : '\nDry run only. Nothing was written. Re-run with --commit to create the blocks and schedule them.');
}

if (require.main === module) {
  run().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
}

module.exports = { CLIENTS, START, WARM_UP, planDates, estimateMinutes };
