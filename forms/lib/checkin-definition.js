/**
 * Weekly check-in form definition - single source of truth for the forms
 * service. Mirrors connor-weekly-checkin-reference.md exactly, including the
 * original Typeform field refs, so submissions written to `checkins.form_data`
 * are indistinguishable from historical Typeform submissions and every portal
 * parser and trend graph works unchanged.
 */

const LOW_THRESHOLD = 5;          // follow-ups trigger at 5 or below
const STRESS_HIGH_THRESHOLD = 6;  // stress follow-up triggers at 6 or above (inverted question)

const QUESTIONS = [
  // Identity. The check-in link is shared by every client (same model Typeform
  // used), so this answer is what resolves the submission to a client row.
  // The ref is the original Typeform name field, so new submissions sit in
  // checkins.form_data in the same shape as the historical ones.
  { id: 'client_name', kind: 'text', number: 1, required: true,
    ref: 'be65ced6-dd03-44dd-86a8-e09d7d48f334',
    fieldType: 'short_text',
    question: 'Full name (as shown in Trainerize)',
    hint: 'We have built a new coaching dashboard. For the information to link, your name must be spelled as in Trainerize.\nThanks!' },

  { id: 'overall_performance', kind: 'scale', number: 2,
    ref: '08a11882-5f58-44a8-9e70-5d108f2aaedc',
    question: 'How would you rate your overall performance this week?',
    low: 'Poor week', high: 'Excellent week' },

  { id: 'biggest_win', kind: 'textarea', number: 3,
    ref: '72dfa035-75f0-4401-be78-84f8cb5da3cf',
    question: 'What was your biggest win this week?' },

  { id: 'training_rating', kind: 'scale', number: 4,
    ref: '522e6339-ef63-49c7-9b95-4d925841afe2',
    question: 'How did your training/cardio go this week?',
    low: 'Way off', mid: 'Could be sharper', high: 'Fully dialled in' },
  { id: 'training_issue', kind: 'textarea', number: '4a',
    ref: '2f62d196-6bc3-4341-a802-a94d617fd28a',
    conditional: { field: 'training_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with training?' },

  { id: 'step_rating', kind: 'scale', number: 5,
    ref: '33b74dae-ec78-4b11-a236-ef7639ae5473',
    question: 'Did you hit your daily step target this week?',
    low: 'Not even close', high: 'Every single day' },
  { id: 'step_issue', kind: 'textarea', number: '5a',
    ref: 'bb208412-8ca5-4467-8602-0ad2d1f7f3ad',
    conditional: { field: 'step_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with steps?' },

  { id: 'nutrition_rating', kind: 'scale', number: 6,
    ref: '88b092a4-e251-47ce-a298-520ef4edc1cc',
    question: 'How would you rate your nutrition this week?',
    low: 'Way off plan', high: 'Fully on plan' },
  { id: 'nutrition_issue', kind: 'textarea', number: '6a',
    ref: '6cdaac53-9eae-4322-a8cc-7a3e0ad6eba3',
    conditional: { field: 'nutrition_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with nutrition?' },
  { id: 'nutrition_info_vs_execution', kind: 'choice', number: '6b',
    ref: 'f7145682-1cf2-4a81-8206-f899673ff883',
    conditional: { field: 'nutrition_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'Is it an information issue or an execution issue?',
    hint: 'Information = you were not sure what to do. Execution = you knew, but it did not happen.',
    options: ['Information issue', 'Execution issue'],
    answerType: 'text' },

  { id: 'days_on_plan', kind: 'choice', number: 7,
    ref: '87aa3c32-a515-4a76-a9d6-257a08bbb893',
    question: 'Roughly how many days this week would you say you were "on plan" with food?',
    options: ['0-1 days', '2-3 days', '4-5 days', '6-7 days'],
    answerType: 'choice' },

  { id: 'sleep_rating', kind: 'scale', number: 8,
    ref: 'b56a1664-564e-4046-a1f0-b4502c5c613e',
    question: 'How would you rate your sleep this week on average?',
    low: 'Running on fumes', mid: 'Broken but bearable', high: 'Sleep dialled in' },
  { id: 'sleep_issue', kind: 'textarea', number: '8a',
    ref: 'c26c1eb4-ce78-4f8d-9542-c3d0a168ae94',
    conditional: { field: 'sleep_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with sleep?' },

  { id: 'digestion_rating', kind: 'scale', number: 9,
    ref: 'b4ec8f22-da73-4b69-9d13-bbde511d7b5e',
    question: 'How would you rate your digestion this week on average?',
    low: 'War zone', mid: 'Not ideal, but ok', high: 'Running smooth' },
  { id: 'digestion_issue', kind: 'textarea', number: '9a',
    ref: 'c3d0c143-ea9e-4f0a-a8cb-9306e24c1517',
    conditional: { field: 'digestion_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with digestion?' },

  // INVERTED question - high raw stress scores LOW points (see WEIGHT_BRACKETS)
  { id: 'stress_rating', kind: 'scale', number: 10,
    ref: '1f75d0a7-b810-4f00-821a-e8151e27d8fe',
    question: 'What was your average stress level this week?',
    hint: 'Heads up - 1 means low stress, 10 is high stress.',
    low: 'Clear-headed', mid: 'Manageable', high: 'Overloaded' },
  { id: 'stress_source', kind: 'textarea', number: '10a',
    ref: '6f1349a2-e67a-42e5-90ca-48752037f4c6',
    conditional: { field: 'stress_rating', op: 'gte', value: STRESS_HIGH_THRESHOLD },
    question: 'What was the main source of stress?' },

  { id: 'progress_direction', kind: 'choice', number: 11,
    ref: '1a1768d8-ed8f-4780-aece-f06e9221e7ad',
    question: 'Do you feel you progressed, regressed, or stayed the same last week?',
    options: ['Progressed', 'Stayed the same', 'Regressed'],
    answerType: 'choice' },

  { id: 'help_request', kind: 'multichoice', number: 12,
    ref: '0c8bb709-de48-480e-b4da-8232827200ae',
    question: 'Is there anything specific you want my help with this week?',
    hint: 'Choose as many as you like',
    sections: [
      { heading: null, options: [
        'No, all good, just keep me accountable' ] },
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
        'I need help improving my sleep this week.',
        'I need help managing stress this week.',
        'I need help structuring my routine this week.' ] },
    ],
    otherOption: true },
  { id: 'upcoming_notes', kind: 'textarea', number: 13,
    ref: '147c7a86-c8fd-4782-8f45-0995a5dad8e7',
    question: 'Is there anything coming up this week I should know about?' },
];

// Weighted score brackets (raw 1-10 -> weighted 1-5), for admin display only.
// The portal computes scores itself from form_data; these must stay in sync
// with backend/lib/overview-parsers.js.
const WEIGHT_BRACKETS = {
  overall_performance: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  training_rating:     [1, 1, 2, 2, 2, 3, 3, 4, 5, 5],
  step_rating:         [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition_rating:    [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep_rating:        [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion_rating:    [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress_rating:       [5, 5, 5, 5, 4, 3, 3, 2, 2, 2], // INVERTED
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

// Score-based end screens shown after submit (gauge + message), mirroring the
// Typeform outcome screens. Same brackets as SCORE_BANDS - keep in sync.
// Dial order left to right: critical, under, stable, high, peak.
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
    "Rough week - but that's part of the game.",
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
