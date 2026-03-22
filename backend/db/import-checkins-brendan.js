/**
 * import-checkins-brendan.js
 *
 * Imports 8 real Typeform weekly check-in responses for Brendan Smartt.
 * Data extracted from the Typeform CSV export.
 *
 * Field refs, scoring brackets, and form_data structure match
 * connor-weekly-checkin-reference.md exactly.
 *
 * Usage: node backend/db/import-checkins-brendan.js
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

// --- 8 real responses from Typeform CSV (oldest first) ---
const WEEKS = [
  // Week 1 — Jan 25 — Score: 32
  {
    typeformResponseId: 'c9kzkp1yo4z1ntm9srihjc9kzkz3j898',
    submittedAt: '2026-01-25T15:36:39Z',
    cycleStart: '2026-01-25',
    overall: 6, training: 7, steps: 6, nutrition: 8,
    daysOnPlan: '4-5 days', sleep: 8, digestion: 8, stress: 7,
    progress: 'Stayed the same',
    biggestWin: 'Did 5k in 24 mins this morning and then did full S&C session.  Tired afterwards but could not have done anything like that last year',
    helpRequest: 'No, all good, just keep me accountable',
    upcomingNotes: 'Gym is closed for refurbishment Monday & Tuesday so next gym session will be Wednesday.',
    stressSource: 'Usual stuff',
  },
  // Week 2 — Feb 1 — Score: 38
  {
    typeformResponseId: '5qgicudyusox5e35qgz56bsk0apz26e4',
    submittedAt: '2026-02-01T12:14:47Z',
    cycleStart: '2026-02-01',
    overall: 8, training: 8, steps: 9, nutrition: 9,
    daysOnPlan: '4-5 days', sleep: 9, digestion: 9, stress: 8,
    progress: 'Progressed',
    biggestWin: 'Big Saturday. An hour of Paddle, 5k run and probably my best ever gym session. Felt great and feel ok this morning too',
    helpRequest: 'No, all good, just keep me accountable',
    upcomingNotes: "I'm going to have a go at doing the 10k this week I think.  Maybe Friday or Saturday depending on how the week goes.",
    stressSource: 'General',
  },
  // Week 3 — Feb 8 — Score: 42
  {
    typeformResponseId: '5h1cw8i831c3ycz5h17831sch8oqbho7',
    submittedAt: '2026-02-08T13:05:22Z',
    cycleStart: '2026-02-08',
    overall: 9, training: 9, steps: 9, nutrition: 8,
    daysOnPlan: '6-7 days', sleep: 9, digestion: 9, stress: 7,
    progress: 'Progressed',
    biggestWin: '8k run on Saturday (39.36) after playing Padel for an hour.  Also did good gym session Sunday so delighted with the recovery',
    helpRequest: 'How do I adjust my calorie target on My Fitness Pal?  Think we said we\'d up to 2400 except for Saturday?',
    upcomingNotes: "No.  Should be a pretty average week.  Didn't do the 10k yesterday but lads were short of 1 so had to play Padel.  Did 8k but didn't have 10 in the legs.  We'll try to get to 8.5k next week and maybe increase by 0.5k each week",
    stressSource: 'Stress was a pretty manageable level.  Had a board meeting on Wednesday but good overall I\'d have said',
  },
  // Week 4 — Feb 15 — Score: 35
  {
    typeformResponseId: 've7a0n9erwgo00kyutve7a0n9eo4t4ro',
    submittedAt: '2026-02-15T23:45:56Z',
    cycleStart: '2026-02-15',
    overall: 8, training: 8, steps: 7, nutrition: 7,
    daysOnPlan: '4-5 days', sleep: 8, digestion: 6, stress: 7,
    progress: 'Progressed',
    biggestWin: 'Good week overall.  3 gym sessions + 5k run + Padel',
    helpRequest: 'I found the legs heavy and was generally a bit achy this week. Felt better today. Is that dehydration?',
    upcomingNotes: 'No',
    stressSource: "Don't think it was higher tbh",
  },
  // Week 5 — Feb 22 — Score: 36
  {
    typeformResponseId: 'okaqxecvqf89481vokaqlgfjmiezuagb',
    submittedAt: '2026-02-22T20:42:41Z',
    cycleStart: '2026-02-22',
    overall: 8, training: 7, steps: 5, nutrition: 8,
    daysOnPlan: '4-5 days', sleep: 8, digestion: 9, stress: 7,
    progress: 'Progressed',
    biggestWin: 'Did a big day of exercise on Thursday and recovered pretty well',
    helpRequest: 'Are we still ok with weight creeping up?  Waist still seems as good as it was judging by belt notches\u2026..',
    upcomingNotes: 'No.  Normal week',
    stressSource: 'I think this thing tells me I have higher stress every week!',
  },
  // Week 6 — Mar 1 — Score: 35
  {
    typeformResponseId: '951bn06ikoj4v1bif6bn951bn06i3uwe',
    submittedAt: '2026-03-01T20:58:56Z',
    cycleStart: '2026-03-01',
    overall: 7, training: 7, steps: 8, nutrition: 7,
    daysOnPlan: '4-5 days', sleep: 9, digestion: 9, stress: 7,
    progress: 'Stayed the same',
    biggestWin: 'Not sure there were any big wins this week',
    helpRequest: 'No, all good, just keep me accountable',
    upcomingNotes: 'No',
    stressSource: "It wasn't",
  },
  // Week 7 — Mar 8 — Score: 32
  {
    typeformResponseId: 'nuin8l71tlyb1pxnuin88cmao7h34kbk',
    submittedAt: '2026-03-08T12:28:16Z',
    cycleStart: '2026-03-08',
    overall: 7, training: 6, steps: 6, nutrition: 7,
    daysOnPlan: '4-5 days', sleep: 8, digestion: 9, stress: 8,
    progress: 'Stayed the same',
    biggestWin: 'Had 4 social nights this week and managed to control the intake reasonably well!',
    helpRequest: 'No, all good, just keep me accountable',
    upcomingNotes: 'No',
    stressSource: 'Life baby!',
  },
  // Week 8 (most recent) — Mar 15/16 — Score: 35
  {
    typeformResponseId: 'swo4bjvkd2a6t2p4fk2glsswo4bj7lw5',
    submittedAt: '2026-03-16T10:31:27Z',
    cycleStart: '2026-03-15',
    overall: 7, training: 7, steps: 8, nutrition: 8,
    daysOnPlan: '4-5 days', sleep: 9, digestion: 9, stress: 8,
    progress: 'Stayed the same',
    biggestWin: 'Signs of getting stronger in gym',
    helpRequest: 'No, all good, just keep me accountable',
    upcomingNotes: 'No',
    stressSource: 'House thing finally nearing an end but lots of coordination of suppliers and cranky wife!!',
  },
];

/**
 * Build form_data JSONB array for a single week.
 * Matches the Typeform answer structure that overview.js parses.
 */
function buildFormData(week) {
  const answers = [];

  // Name (short_text)
  answers.push({
    type: 'text',
    text: 'Brendan Smartt',
    field: {
      id: 'be65ced6-dd03-44dd-86a8-e09d7d48f334',
      type: 'short_text',
      title: 'Your full name',
    },
  });

  // Q1: Overall performance
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

  // Q2: Training/cardio
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

  // Q3: Steps
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

  // Q4: Nutrition
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

  // Q6: Sleep
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

  // Q7: Digestion
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

  // Q8: Stress (INVERTED)
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

  // Q8 follow-up: stress source (always present in Brendan's data)
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

  // Q10: Biggest win
  answers.push({
    type: 'text',
    text: week.biggestWin,
    field: {
      id: '72dfa035-75f0-4401-be78-84f8cb5da3cf',
      type: 'long_text',
      title: 'What was your biggest win this week?',
    },
  });

  // Q11: Help request
  answers.push({
    type: 'text',
    text: week.helpRequest,
    field: {
      id: '0c8bb709-de48-480e-b4da-8232827200ae',
      type: 'long_text',
      title: 'Where would you like extra help or support from me this week?',
    },
  });

  // Q12: Upcoming notes
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

async function importCheckins() {
  const client = await pool.connect();
  try {
    // Look up Brendan Smartt
    const brendan = await client.query(
      `SELECT id FROM clients WHERE name = 'Brendan Smartt' AND coach_id = $1`,
      [COACH_ID]
    );
    if (brendan.rows.length === 0) {
      throw new Error('Brendan Smartt not found in clients table.');
    }
    const clientId = brendan.rows[0].id;

    await client.query('BEGIN');

    for (const week of WEEKS) {
      const formData = buildFormData(week);

      // Calculate weighted scores for verification logging
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
         VALUES ($1, $2, 'weekly', $3, $4, false, NULL, $5, $6)
         ON CONFLICT (typeform_response_id) DO NOTHING`,
        [
          COACH_ID,
          clientId,
          week.typeformResponseId,
          week.submittedAt,
          week.cycleStart,
          JSON.stringify(formData),
        ]
      );

      console.log(
        `  ${week.cycleStart}: ` +
        `raw [${week.overall},${week.training},${week.steps},${week.nutrition},${week.daysOnPlan},${week.sleep},${week.digestion},${week.stress},${week.progress}] ` +
        `weighted [${w.overall},${w.training},${w.steps},${w.nutrition},${w.daysOnPlan},${w.sleep},${w.digestion},${w.stress},${w.progress}] ` +
        `total=${total}/45`
      );
    }

    await client.query('COMMIT');
    console.log('\nImported 8 real weekly check-ins for Brendan Smartt.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

importCheckins();
