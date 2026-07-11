/**
 * End of Month report definition - mirrors connor-eom-report-reference.md
 * exactly, including the semantic eom-* field refs the portal already parses.
 *
 * Key differences from the weekly check-in (per the reference):
 *  - Pillar order: training first, overall performance last
 *  - Stress bracket position 6 scores 4 (weekly scores 3)
 *  - Follow-up thresholds are explicit: <= 6 low, >= 7 for stress
 *  - Follow-ups are multiple choice (stress source is free text)
 *  - Adds direction confidence (unscored scale) and hindsight questions
 */

const LOW_THRESHOLD = 6;          // follow-ups trigger at 6 or below
const STRESS_HIGH_THRESHOLD = 7;  // stress follow-up triggers at 7 or above (inverted question)

const QUESTIONS = [
  { id: 'biggest_win', kind: 'textarea', number: 1,
    ref: 'eom-biggest-win',
    question: 'What was your biggest win this month?' },

  { id: 'training_rating', kind: 'scale', number: 2,
    ref: 'eom-training-rating',
    question: 'How did your training/cardio go this month overall?',
    low: 'Way off', mid: 'Could be sharper', high: 'Fully dialled in' },
  { id: 'training_issue', kind: 'choice', number: '2a',
    ref: 'eom-training-issue',
    conditional: { field: 'training_rating', op: 'lte', value: LOW_THRESHOLD },
    question: "What best explains why training didn't go to plan?",
    options: [
      'Genuinely no time (work/childcare/travel)',
      'Energy was on the floor',
      'Gym access/travel issues',
      "Minor injury/pain and I didn't want to push it",
      'I could have trained but motivation was low',
      'Other',
    ],
    answerType: 'choice' },

  { id: 'step_rating', kind: 'scale', number: 3,
    ref: 'eom-step-rating',
    question: 'How were your steps/daily activity this month?',
    low: 'Barely moved', mid: 'Hit & miss', high: 'Nailed it daily' },
  { id: 'step_issue', kind: 'choice', number: '3a',
    ref: 'eom-step-issue',
    conditional: { field: 'step_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What got in the way of your steps/activity?',
    options: [
      "Didn't prioritise them",
      'Workdays were too sedentary / stuck at desk',
      'Bad weather / environment',
      'Unsure what target to aim for',
      'Other',
    ],
    answerType: 'choice' },

  { id: 'nutrition_rating', kind: 'scale', number: 4,
    ref: 'eom-nutrition-rating',
    question: 'How would you rate your nutrition this month overall?',
    low: 'Very poor', mid: 'Hit & miss', high: 'Nailed it daily' },
  { id: 'nutrition_issue', kind: 'choice', number: '4a',
    ref: 'eom-nutrition-issue',
    conditional: { field: 'nutrition_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the main issue with nutrition?',
    options: [
      "I didn't really track or pay attention",
      'Weekends / social events derailed things',
      'Overate in the evenings',
      'I wasn\'t sure what "on plan" actually looked like',
      'Missed protein targets',
      'Too many takeaways / convenience food',
      'Underate overall and felt low energy / binge-y after',
      'Other',
    ],
    answerType: 'choice' },
  { id: 'nutrition_info_vs_execution', kind: 'choice', number: '4b',
    ref: 'eom-nutrition-info-exec',
    conditional: { field: 'nutrition_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'Is this mostly an information problem or an execution problem?',
    options: [
      "I don't fully know what I should be doing",
      "I know what to do, I just didn't do it",
      'A bit of both',
    ],
    answerType: 'choice' },

  { id: 'days_on_plan', kind: 'choice', number: 5,
    ref: 'eom-days-on-plan',
    question: 'On average, how many days per week were you "on plan" with food?',
    options: ['0-1 days', '2-3 days', '4-5 days', '6-7 days'],
    answerType: 'choice' },

  { id: 'sleep_rating', kind: 'scale', number: 6,
    ref: 'eom-sleep-rating',
    question: 'How would you rate your sleep this month on average?',
    low: 'Running on fumes', mid: 'Broken but bearable', high: 'Sleep dialled in' },
  { id: 'sleep_issue', kind: 'choice', number: '6a',
    ref: 'eom-sleep-issue',
    conditional: { field: 'sleep_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What mainly affected your sleep?',
    options: [
      'Struggling to switch off / mind racing',
      'Bedtime/routine all over the place',
      'Kids / family interruptions',
      'Work / late calls or emails',
      'Pain / discomfort',
      'Other',
    ],
    answerType: 'choice' },

  { id: 'digestion_rating', kind: 'scale', number: 7,
    ref: 'eom-digestion-rating',
    question: 'How would you rate your digestion this month on average?',
    low: 'War zone', mid: 'Not ideal, but ok', high: 'Running smooth' },
  { id: 'digestion_issue', kind: 'choice', number: '7a',
    ref: 'eom-digestion-issue',
    conditional: { field: 'digestion_rating', op: 'lte', value: LOW_THRESHOLD },
    question: "Digestion wasn't ideal - anything you think might've triggered it?",
    options: [
      'Bloating',
      'Constipation',
      'Loose stools',
      'Stomach pain / discomfort',
      "Not sure, just didn't feel right",
    ],
    answerType: 'choice' },

  // INVERTED question - high raw stress scores LOW points (see WEIGHT_BRACKETS)
  { id: 'stress_rating', kind: 'scale', number: 8,
    ref: 'eom-stress-rating',
    question: 'What was your average stress level this month?',
    hint: 'Heads up - 1 means low stress, 10 is high stress.',
    low: 'Clear-headed', mid: 'Manageable', high: 'Overloaded' },
  { id: 'stress_source', kind: 'textarea', number: '8a',
    ref: 'eom-stress-source',
    conditional: { field: 'stress_rating', op: 'gte', value: STRESS_HIGH_THRESHOLD },
    question: 'You reported higher stress - was it work, home, or just general pressure?' },

  { id: 'progress_direction', kind: 'choice', number: 9,
    ref: 'eom-progress-direction',
    question: 'Do you feel you progressed, stayed the same, or regressed this month?',
    options: ['Progressed', 'Stayed the same', 'Regressed'],
    answerType: 'choice' },

  { id: 'overall_performance', kind: 'scale', number: 10,
    ref: 'eom-overall-performance',
    question: 'Overall, how would you rate your month?',
    low: 'Tough month', mid: 'Ticking over', high: 'Firing on all cylinders' },

  // Unscored scale - coach insight only, excluded from WEIGHT_BRACKETS
  { id: 'direction_confidence', kind: 'scale', number: 11,
    ref: 'eom-direction-confidence',
    question: "How confident do you feel about the direction we're heading?",
    low: 'Lost', mid: 'I know the general gist', high: 'I know exactly where we\'re heading' },

  { id: 'help_request', kind: 'multichoice', number: 12,
    ref: 'eom-help-request',
    question: 'Is there anything specific you want my help with?',
    hint: 'Choose as many as you like',
    sections: [
      { heading: 'Training', options: [
        "I'm unsure about exercise technique",
        "I'm not confident in how hard to push / progress",
        "I'm struggling to fit sessions into my week",
        "I'm unsure about the overall plan structure" ] },
      { heading: 'Nutrition', options: [
        'I\'m unclear on what "on plan" looks like',
        'I struggled with evenings/weekends',
        "I'm unsure how to hit protein/calories",
        'I need more ideas for meals/snacks' ] },
      { heading: 'Lifestyle / Recovery', options: [
        'I need help improving my sleep',
        'I need help managing stress',
        'I need help structuring my routine' ] },
      { heading: 'Other', options: [
        'No, all good, just keep me accountable' ] },
    ],
    otherOption: true },

  { id: 'advice_to_past_self', kind: 'textarea', number: 13,
    ref: 'eom-hindsight',
    question: "If you could go back to the start of the month, what's one thing you'd improve or do differently?" },

  { id: 'upcoming_notes', kind: 'textarea', number: 14,
    ref: 'eom-upcoming-notes',
    question: 'Is there anything coming up next month I should know about?' },
];

// Weighted score brackets (raw 1-10 -> weighted 1-5). Stress position 6
// scores 4 here vs 3 on the weekly - the EOM is more forgiving on
// moderate stress. direction_confidence is deliberately absent (unscored).
const WEIGHT_BRACKETS = {
  training_rating:     [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  step_rating:         [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition_rating:    [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep_rating:        [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion_rating:    [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress_rating:       [5, 5, 5, 5, 4, 4, 3, 2, 2, 2], // INVERTED
  overall_performance: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
};
const DAYS_ON_PLAN_WEIGHTS = { '0-1 days': 1, '2-3 days': 2, '4-5 days': 4, '6-7 days': 5 };
const PROGRESS_WEIGHTS = { 'Progressed': 5, 'Stayed the same': 3, 'Regressed': 1 };

const SCORE_BANDS = [
  { min: 38, label: 'Sharp across the board' },
  { min: 31, label: 'Dialled in' },
  { min: 24, label: 'In control' },
  { min: 17, label: 'Not bad' },
  { min: 10, label: 'Rough week' },
];

// Same gauge screens as the weekly, with month wording where the copy
// mentions a period. Review the copy before go-live.
const END_SCREENS = [
  { min: 38, key: 'peak', label: 'Peak Performance', color: '#43a047', messages: [
    'Sharp across the board.',
    "We'll double down on what's working and keep the pace up.",
  ] },
  { min: 31, key: 'high', label: 'High Performance', color: '#8bc34a', messages: [
    "You're dialled in.",
    "Don't underestimate the power of a consistent 7-8/10 across the board.",
    "I'll highlight any small upgrades, but we're definitely on track.",
  ] },
  { min: 24, key: 'stable', label: 'Stable', color: '#fdd835', messages: [
    "You're in control - but there's more here.",
    "Let's find the low hanging fruit to push you forward.",
  ] },
  { min: 17, key: 'under', label: 'Underperforming', color: '#f57c00', messages: [
    "Not a bad effort - but something's up.",
    "I'll help you simplify and direct the effort where it matters most.",
  ] },
  { min: 10, key: 'critical', label: 'Critical', color: '#e53935', messages: [
    "Rough month - but that's part of the game.",
    'We just need to understand where things broke down and reset with a sharper plan.',
  ] },
];

function conditionMet(cond, answers) {
  if (!cond) return true;
  const v = answers[cond.field];
  if (v == null) return false;
  return cond.op === 'lte' ? v <= cond.value : v >= cond.value;
}

module.exports = {
  QUESTIONS,
  WEIGHT_BRACKETS,
  DAYS_ON_PLAN_WEIGHTS,
  PROGRESS_WEIGHTS,
  SCORE_BANDS,
  END_SCREENS,
  LOW_THRESHOLD,
  STRESS_HIGH_THRESHOLD,
  conditionMet,
};
