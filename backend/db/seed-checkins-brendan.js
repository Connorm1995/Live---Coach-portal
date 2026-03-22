/**
 * seed-checkins-brendan.js
 *
 * Inserts 8 realistic weekly check-in records for Brendan Smartt.
 * Each check-in matches the exact question structure, field refs, scoring
 * brackets, and weighted score logic from connor-weekly-checkin-reference.md.
 *
 * Usage: node backend/db/seed-checkins-brendan.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./pool');

const COACH_ID = 1;

// --- Scoring bracket tables (raw 1-10 -> weighted 1-5) ---
const BRACKETS = {
  overall:   [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  training:  [1, 1, 2, 2, 2, 3, 3, 4, 5, 5],
  steps:     [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition: [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep:     [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion: [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress:    [5, 5, 5, 5, 4, 3, 3, 2, 2, 2], // INVERTED
};

const DAYS_ON_PLAN_WEIGHTS = {
  '0-1 days': 1,
  '2-3 days': 2,
  '4-5 days': 4,
  '6-7 days': 5,
};

const PROGRESS_WEIGHTS = {
  'Progressed': 5,
  'Stayed the same': 3,
  'Regressed': 1,
};

function weighted(category, rawValue) {
  return BRACKETS[category][rawValue - 1];
}

// --- 8 weeks of data ---
// Narrative: strong start (1-3), dip (4-5), recovery (6-8)
// Each week: raw scores, choice values, text answers, conditional follow-ups

// Verified weighted scores per bracket table (computed inline for each week):
// Week 1: 7(4)+7(3)+7(4)+6(4)+4-5d(4)+6(2)+7(4)+4(5)+Prog(5) = 35
// Week 2: 7(4)+8(4)+8(4)+7(5)+6-7d(5)+6(2)+7(4)+3(5)+Prog(5) = 38
// Week 3: 7(4)+6(3)+7(4)+6(4)+4-5d(4)+7(3)+7(4)+4(5)+Prog(5) = 36
// Week 4: 6(3)+5(2)+5(3)+5(3)+2-3d(2)+5(2)+6(3)+8(2)+Same(3) = 23
// Week 5: 5(3)+5(2)+4(2)+4(2)+2-3d(2)+4(1)+5(2)+9(2)+Reg(1)  = 17 ← stress spike deleted was wrong
// (recheck: Q4 nut=4 -> 2, Q5 2-3d -> 2, Q8 stress=9 -> 2) sums: 3+2+2+2+2+1+2+2+1 = 17? No:
// Let me carefully redo: overall=5(3), training=5(2), steps=4(2), nutrition=4(2), days=2-3(2),
// sleep=4(1), digestion=5(2), stress=9(2), progress=Regressed(1) = 3+2+2+2+2+1+2+2+1 = 17
// Still need 22-27. Let me raise some scores.
//
// NEW week 4: overall=6(3), training=6(3), steps=5(3), nutrition=5(3), days=2-3d(2), sleep=5(2), digestion=6(3), stress=7(3), progress=Same(3) = 25
// NEW week 5: overall=5(3), training=5(2), steps=5(3), nutrition=4(2), days=2-3d(2), sleep=4(1), digestion=5(2), stress=8(2), progress=Reg(1) = 18
// Still too low. Raise: overall=6(3), training=5(2), steps=5(3), nutrition=5(3), days=4-5d(4), sleep=5(2), digestion=5(2), stress=8(2), progress=Same(3) = 24
// Good, 24. But progressed to Regressed doesn't fit with 4-5 days. Let's try:
// overall=5(3), training=5(2), steps=5(3), nutrition=5(3), days=2-3d(2), sleep=5(2), digestion=6(3), stress=8(2), progress=Same(3) = 23
// 23, in range. But should be lower than w4. Let's set w4=27, w5=23.
//
// Week 6: overall=7(4), training=6(3), steps=6(3), nutrition=6(4), days=4-5d(4), sleep=6(2), digestion=6(3), stress=5(4), progress=Same(3) = 30
// 30 in range 29-35.
// Week 7: overall=7(4), training=7(3), steps=7(4), nutrition=7(5), days=4-5d(4), sleep=6(2), digestion=7(4), stress=4(5), progress=Prog(5) = 36
// 36 - above 35. Lower: sleep=5(2)->no change. Lower training=6(3) -> 33. Good.
// Week 8: overall=8(4), training=7(3), steps=7(4), nutrition=7(5), days=6-7d(5), sleep=7(3), digestion=7(4), stress=4(5), progress=Prog(5) = 38
// 38 - above 35. Lower: training=6(3)->36. Lower again: daysOnPlan=4-5d(4)->35. Good.

const WEEKS = [
  // Week 1 (oldest) - Jan 25 - Strong start
  // Weighted: 4+3+4+4+4+2+4+5+5 = 35
  {
    num: 1,
    cycleStart: '2026-01-25',
    submittedAt: '2026-01-26T08:22:00Z',
    responded: true, respondedAt: '2026-01-27T09:15:00Z', // Tuesday morning
    overall: 7, training: 7, steps: 7, nutrition: 6,
    daysOnPlan: '4-5 days', sleep: 6, digestion: 7, stress: 4, progress: 'Progressed',
    biggestWin: 'Got all four training sessions done this week for the first time in a while. Felt really good to get back into a proper routine after the Christmas break.',
    helpRequest: 'Could use some guidance on warming up before heavy leg days. My knees have been a bit stiff in the first few sets.',
    upcomingNotes: 'Work trip to Cork on Thursday so will need to train Wednesday evening instead. No events at the weekend.',
    trainingIssue: null, stepIssue: null, nutritionIssue: null,
    nutritionInfoVsExecution: null, sleepIssue: null, digestionIssue: null,
    stressSource: null,
  },
  // Week 2 - Feb 1 - Building momentum
  // Weighted: 4+4+4+5+5+2+4+5+5 = 38
  {
    num: 2,
    cycleStart: '2026-02-01',
    submittedAt: '2026-02-02T08:45:00Z',
    responded: true, respondedAt: '2026-02-03T10:05:00Z', // Tuesday morning
    overall: 7, training: 8, steps: 8, nutrition: 7,
    daysOnPlan: '6-7 days', sleep: 6, digestion: 7, stress: 3, progress: 'Progressed',
    biggestWin: 'Hit a new PB on bench press - 85kg for 5 reps. Also kept step count above target every single day this week.',
    helpRequest: 'Happy with everything right now. Maybe some tips on getting more protein at breakfast without cooking a full meal.',
    upcomingNotes: 'Nothing major coming up. Quiet weekend planned so should be a good week for training.',
    trainingIssue: null, stepIssue: null, nutritionIssue: null,
    nutritionInfoVsExecution: null, sleepIssue: null, digestionIssue: null,
    stressSource: null,
  },
  // Week 3 - Feb 8 - Good week
  // Weighted: 4+3+4+4+4+2+5+5+5 = 36
  {
    num: 3,
    cycleStart: '2026-02-08',
    submittedAt: '2026-02-09T09:10:00Z',
    responded: true, respondedAt: '2026-02-11T08:40:00Z', // Wednesday morning
    overall: 7, training: 7, steps: 8, nutrition: 6,
    daysOnPlan: '4-5 days', sleep: 6, digestion: 8, stress: 4, progress: 'Progressed',
    biggestWin: 'Smashed my step target every day. Averaged over 12k steps which is the best week I have had. Digestion has been really good since adding more fibre.',
    helpRequest: 'Would like to review my cardio plan. Feeling like I could push the running a bit more now that my base fitness has improved.',
    upcomingNotes: 'Friend visiting from London on Saturday. Will be eating out Saturday evening but planning to keep it reasonable.',
    trainingIssue: null, stepIssue: null, nutritionIssue: null,
    nutritionInfoVsExecution: null, sleepIssue: null, digestionIssue: null,
    stressSource: null,
  },
  // Week 4 - Feb 15 - Dip starts
  // Weighted: 3+3+3+3+2+2+3+3+3 = 25
  {
    num: 4,
    cycleStart: '2026-02-15',
    submittedAt: '2026-02-16T09:35:00Z',
    responded: true, respondedAt: '2026-02-17T09:50:00Z', // Tuesday morning
    overall: 6, training: 6, steps: 5, nutrition: 5,
    daysOnPlan: '2-3 days', sleep: 5, digestion: 6, stress: 7, progress: 'Stayed the same',
    biggestWin: 'Managed to get three sessions in despite a rough week at work. Did not miss any completely even though I was tempted to skip Friday.',
    helpRequest: 'Struggling with energy levels. Could we look at my pre-workout nutrition? I am feeling flat going into sessions.',
    upcomingNotes: 'Deadline at work next Friday so this week will be intense. Might need to move some sessions around.',
    trainingIssue: null,
    stepIssue: 'Sat at a desk most of the week because of a big project at work. Steps dropped off from where they were.',
    nutritionIssue: 'Ate out three times this week for work lunches. Hard to track accurately and portions were bigger than I would normally have.',
    nutritionInfoVsExecution: 'Execution',
    sleepIssue: 'Struggling to switch off at night. Work stress keeping me up until midnight most nights.',
    digestionIssue: null,
    stressSource: 'Major project deadline at work. The team is under pressure and I have been working late every evening this week.',
  },
  // Week 5 - Feb 22 - Low point
  // Weighted: 3+2+3+3+2+2+2+2+3 = 22
  {
    num: 5,
    cycleStart: '2026-02-22',
    submittedAt: '2026-02-23T09:48:00Z',
    responded: true, respondedAt: '2026-02-25T10:20:00Z', // Wednesday morning
    overall: 5, training: 5, steps: 5, nutrition: 5,
    daysOnPlan: '2-3 days', sleep: 5, digestion: 5, stress: 9, progress: 'Stayed the same',
    biggestWin: 'Honestly not much this week. I did make it to three sessions which is better than nothing. Also caught up on meal prep on Sunday which should help next week.',
    helpRequest: 'Need help getting back on track. This week got away from me and I feel like I am sliding. Any advice on bouncing back after a bad stretch?',
    upcomingNotes: 'Work project wraps up on Wednesday so things should calm down from Thursday onwards. Planning to reset properly next week.',
    trainingIssue: 'Only got three sessions in. Missed upper body day completely and the other sessions felt flat.',
    stepIssue: 'Barely left the house most days. Working from home and just did not prioritise getting outside.',
    nutritionIssue: 'Convenience food most of the week. Takeaway twice, skipped tracking on three days because I did not want to see the numbers.',
    nutritionInfoVsExecution: 'Execution',
    sleepIssue: 'Averaging about 5 hours. Waking up at 4am with work anxiety and cannot get back to sleep.',
    digestionIssue: 'Bloating and discomfort after meals. Probably from the poor food choices and irregular eating times.',
    stressSource: 'Work is still the main issue. The deadline got pushed out and the pressure is relentless. Feeling burnt out.',
  },
  // Week 6 - Mar 1 - Recovery begins
  // Weighted: 3+3+3+4+4+2+3+4+3 = 29
  {
    num: 6,
    cycleStart: '2026-03-01',
    submittedAt: '2026-03-02T08:30:00Z',
    responded: true, respondedAt: '2026-03-03T09:30:00Z', // Tuesday morning
    overall: 6, training: 6, steps: 6, nutrition: 6,
    daysOnPlan: '4-5 days', sleep: 6, digestion: 6, stress: 5, progress: 'Stayed the same',
    biggestWin: 'Got back to four sessions this week and they all felt decent. Sleep is improving - got two nights of 7+ hours which has not happened in weeks.',
    helpRequest: 'Would like to ease back into the higher volume training. Not sure if I should jump straight back to where I was or build up over a couple of weeks.',
    upcomingNotes: 'Quiet week ahead. No social plans. Going to use it to get fully back on track.',
    trainingIssue: null, stepIssue: null,
    nutritionIssue: null,
    nutritionInfoVsExecution: null,
    sleepIssue: null,
    digestionIssue: null,
    stressSource: null,
  },
  // Week 7 - Mar 8 - Rebuilding
  // Weighted: 4+3+4+5+4+2+4+5+5 = 36
  // That's above 35. Let me adjust: training=6(3) -> 4+3+4+5+4+2+4+5+5=36. Hmm.
  // Lower daysOnPlan to 4-5d(4): still 36. Lower nutrition=6(4): 4+3+4+4+4+2+4+5+5=35. Good.
  // Weighted: 4+3+4+4+4+2+4+5+5 = 35
  {
    num: 7,
    cycleStart: '2026-03-08',
    submittedAt: '2026-03-09T08:15:00Z',
    responded: true, respondedAt: '2026-03-10T08:55:00Z', // Tuesday morning
    overall: 7, training: 6, steps: 7, nutrition: 6,
    daysOnPlan: '4-5 days', sleep: 6, digestion: 7, stress: 4, progress: 'Progressed',
    biggestWin: 'Full week of training completed and nutrition was dialled in. Tracked every day and hit protein target 6 out of 7 days. Feeling like myself again.',
    helpRequest: 'Can we look at adding a bit more volume to the upper body sessions? Feeling strong enough to push it now.',
    upcomingNotes: 'Birthday dinner for my sister on Saturday. Will be eating out but I will make smart choices and keep portions in check.',
    trainingIssue: null, stepIssue: null, nutritionIssue: null,
    nutritionInfoVsExecution: null, sleepIssue: null, digestionIssue: null,
    stressSource: null,
  },
  // Week 8 (most recent) - Mar 15 - Strong finish (pending - not yet responded)
  // Weighted: 4+3+4+5+5+3+4+5+5 = 38
  // That's above 35. Let me adjust: training=6(3)->35. daysOnPlan=4-5(4)->34. Good.
  // Actually user said 29-35 for weeks 6-8. So:
  // overall=7(4), training=7(3), steps=7(4), nutrition=6(4), days=4-5d(4), sleep=7(3), digestion=7(4), stress=3(5), progress=Prog(5) = 36
  // Still above. Lower: nutrition=5(3)->35. Good.
  // Weighted: 4+3+4+3+4+3+4+5+5 = 35
  {
    num: 8,
    cycleStart: '2026-03-15',
    submittedAt: '2026-03-16T08:05:00Z',
    responded: false, respondedAt: null,
    overall: 7, training: 7, steps: 7, nutrition: 5,
    daysOnPlan: '4-5 days', sleep: 7, digestion: 7, stress: 3, progress: 'Progressed',
    biggestWin: 'Best week in a long time. Hit all sessions, nutrition was on point, and I beat my bench PB again - 87.5kg for 5. Sleep has been consistent at 7 hours plus every night.',
    helpRequest: 'Feeling great right now. Maybe we could start thinking about adjusting targets for the next block since the current ones are starting to feel achievable.',
    upcomingNotes: 'Nothing unusual this week. Planning to keep the momentum going.',
    trainingIssue: null, stepIssue: null,
    nutritionIssue: 'Nutrition was good most of the week but slipped a bit on Friday. Still tracking everything though.',
    nutritionInfoVsExecution: 'Execution',
    sleepIssue: null, digestionIssue: null,
    stressSource: null,
  },
];

/**
 * Build the form_data array for a single week.
 * Matches the Typeform answer format that parseScores() and parseFormAnswers()
 * in overview.js can parse via keyword matching on field titles.
 */
function buildFormData(week) {
  const answers = [];

  // Name (short_text) - always first
  answers.push({
    type: 'text',
    text: 'Brendan Smartt',
    field: {
      id: 'be65ced6-dd03-44dd-86a8-e09d7d48f334',
      type: 'short_text',
      title: 'Your full name',
    },
  });

  // Q1: Overall performance (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.overall,
    field: {
      id: '08a11882-5f58-44a8-9e70-5d108f2aaedc',
      type: 'opinion_scale',
      title: 'How would you rate your overall performance this week?',
      properties: { steps: 10 },
    },
  });

  // Q2: Training (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.training,
    field: {
      id: '522e6339-ef63-49c7-9b95-4d925841afe2',
      type: 'opinion_scale',
      title: 'How did your training/cardio go this week?',
      properties: { steps: 10 },
    },
  });

  // Q2 follow-up: training issue
  if (week.trainingIssue) {
    answers.push({
      type: 'text',
      text: week.trainingIssue,
      field: {
        id: '2f62d196-6bc3-4341-a802-a94d617fd28a',
        type: 'long_text',
        title: 'What was the issue with training?',
      },
    });
  }

  // Q3: Steps (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.steps,
    field: {
      id: '33b74dae-ec78-4b11-a236-ef7639ae5473',
      type: 'opinion_scale',
      title: 'Did you hit your daily step target this week?',
      properties: { steps: 10 },
    },
  });

  // Q3 follow-up: step issue
  if (week.stepIssue) {
    answers.push({
      type: 'text',
      text: week.stepIssue,
      field: {
        id: 'bb208412-8ca5-4467-8602-0ad2d1f7f3ad',
        type: 'long_text',
        title: 'What was the issue with steps?',
      },
    });
  }

  // Q4: Nutrition (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.nutrition,
    field: {
      id: '88b092a4-e251-47ce-a298-520ef4edc1cc',
      type: 'opinion_scale',
      title: 'How would you rate your nutrition this week?',
      properties: { steps: 10 },
    },
  });

  // Q4 follow-up: nutrition issue
  if (week.nutritionIssue) {
    answers.push({
      type: 'text',
      text: week.nutritionIssue,
      field: {
        id: '6cdaac53-9eae-4322-a8cc-7a3e0ad6eba3',
        type: 'long_text',
        title: 'What was the issue with nutrition?',
      },
    });
  }

  // Q4 follow-up 2: info vs execution
  if (week.nutritionInfoVsExecution) {
    answers.push({
      type: 'text',
      text: week.nutritionInfoVsExecution,
      field: {
        id: 'f7145682-1cf2-4a81-8206-f899673ff883',
        type: 'long_text',
        title: 'Is it an information issue or an execution issue?',
      },
    });
  }

  // Q5: Days on plan (choice)
  answers.push({
    type: 'choice',
    choice: { label: week.daysOnPlan },
    field: {
      id: '87aa3c32-a515-4a76-a9d6-257a08bbb893',
      type: 'multiple_choice',
      title: 'Roughly how many days this week would you say you were on plan with food?',
    },
  });

  // Q6: Sleep (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.sleep,
    field: {
      id: 'b56a1664-564e-4046-a1f0-b4502c5c613e',
      type: 'opinion_scale',
      title: 'How would you rate your sleep this week on average?',
      properties: { steps: 10 },
    },
  });

  // Q6 follow-up: sleep issue
  if (week.sleepIssue) {
    answers.push({
      type: 'text',
      text: week.sleepIssue,
      field: {
        id: 'c26c1eb4-ce78-4f8d-9542-c3d0a168ae94',
        type: 'long_text',
        title: 'What was the issue with sleep?',
      },
    });
  }

  // Q7: Digestion (opinion_scale 1-10)
  answers.push({
    type: 'number',
    number: week.digestion,
    field: {
      id: 'b4ec8f22-da73-4b69-9d13-bbde511d7b5e',
      type: 'opinion_scale',
      title: 'How would you rate your digestion this week on average?',
      properties: { steps: 10 },
    },
  });

  // Q7 follow-up: digestion issue
  if (week.digestionIssue) {
    answers.push({
      type: 'text',
      text: week.digestionIssue,
      field: {
        id: 'c3d0c143-ea9e-4f0a-a8cb-9306e24c1517',
        type: 'long_text',
        title: 'What was the issue with digestion?',
      },
    });
  }

  // Q8: Stress (opinion_scale 1-10, INVERTED)
  answers.push({
    type: 'number',
    number: week.stress,
    field: {
      id: '1f75d0a7-b810-4f00-821a-e8151e27d8fe',
      type: 'opinion_scale',
      title: 'What was your average stress level this week?',
      properties: { steps: 10 },
    },
  });

  // Q8 follow-up: stress source (triggers on HIGH stress, raw >= 6)
  if (week.stressSource) {
    answers.push({
      type: 'text',
      text: week.stressSource,
      field: {
        id: '6f1349a2-e67a-42e5-90ca-48752037f4c6',
        type: 'long_text',
        title: 'What was the main source of stress?',
      },
    });
  }

  // Q9: Progress direction (choice)
  answers.push({
    type: 'choice',
    choice: { label: week.progress },
    field: {
      id: '1a1768d8-ed8f-4780-aece-f06e9221e7ad',
      type: 'multiple_choice',
      title: 'Do you feel you progressed, regressed, or stayed the same last week?',
    },
  });

  // Q10: Biggest win (long_text)
  answers.push({
    type: 'text',
    text: week.biggestWin,
    field: {
      id: '72dfa035-75f0-4401-be78-84f8cb5da3cf',
      type: 'long_text',
      title: 'What was your biggest win this week?',
    },
  });

  // Q11: Help request (long_text)
  answers.push({
    type: 'text',
    text: week.helpRequest,
    field: {
      id: '0c8bb709-de48-480e-b4da-8232827200ae',
      type: 'long_text',
      title: 'Where would you like extra help or support from me this week?',
    },
  });

  // Q12: Upcoming notes (long_text)
  answers.push({
    type: 'text',
    text: week.upcomingNotes,
    field: {
      id: '147c7a86-c8fd-4782-8f45-0995a5dad8e7',
      type: 'long_text',
      title: 'Is there anything coming up this week I should know about?',
    },
  });

  return answers;
}

async function seed() {
  const client = await pool.connect();
  try {
    // Look up Brendan Smartt
    const brendan = await client.query(
      `SELECT id FROM clients WHERE name = 'Brendan Smartt' AND coach_id = $1`,
      [COACH_ID]
    );
    if (brendan.rows.length === 0) {
      throw new Error('Brendan Smartt not found in clients table. Run the main seed script first.');
    }
    const clientId = brendan.rows[0].id;

    await client.query('BEGIN');

    for (const week of WEEKS) {
      const formData = buildFormData(week);

      // Calculate and log weighted scores for verification
      const w = {
        overall: weighted('overall', week.overall),
        training: weighted('training', week.training),
        steps: weighted('steps', week.steps),
        nutrition: weighted('nutrition', week.nutrition),
        daysOnPlan: DAYS_ON_PLAN_WEIGHTS[week.daysOnPlan],
        sleep: weighted('sleep', week.sleep),
        digestion: weighted('digestion', week.digestion),
        stress: weighted('stress', week.stress),
        progress: PROGRESS_WEIGHTS[week.progress],
      };
      const total = Object.values(w).reduce((sum, v) => sum + v, 0);

      await client.query(
        `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, responded_at, cycle_start, form_data)
         VALUES ($1, $2, 'weekly', $3, $4, $5, $6, $7, $8)
         ON CONFLICT (typeform_response_id) DO NOTHING`,
        [
          COACH_ID,
          clientId,
          `seed-brendan-week-${week.num}`,
          week.submittedAt,
          week.responded,
          week.respondedAt,
          week.cycleStart,
          JSON.stringify(formData),
        ]
      );

      console.log(
        `  Week ${week.num} (${week.cycleStart}): ` +
        `raw [${week.overall},${week.training},${week.steps},${week.nutrition},${week.daysOnPlan},${week.sleep},${week.digestion},${week.stress},${week.progress}] ` +
        `weighted [${w.overall},${w.training},${w.steps},${w.nutrition},${w.daysOnPlan},${w.sleep},${w.digestion},${w.stress},${w.progress}] ` +
        `total=${total}/45`
      );
    }

    await client.query('COMMIT');
    console.log('\nSeeded 8 weekly check-ins for Brendan Smartt.');
    console.log('Run "node backend/db/clear-checkins-brendan.js" to remove them.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
