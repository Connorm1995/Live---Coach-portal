/**
 * Weekly check-in form definition - single source of truth for the forms
 * service. Originally mirrored connor-weekly-checkin-reference.md exactly,
 * including the original Typeform field refs, so submissions written to
 * `checkins.form_data` are indistinguishable from historical Typeform
 * submissions and every portal parser and trend graph works unchanged.
 *
 * ---------------------------------------------------------------------------
 * August 2026 revision
 * ---------------------------------------------------------------------------
 * Questions added since the Typeform era use readable refs (`weekly-*`) rather
 * than UUIDs. They have no Typeform history to match, and a readable ref is
 * self-documenting. They must never start with `eom-`, which is how
 * overview-parsers.js tells a monthly report from a weekly check-in.
 *
 * Nothing added in this revision is scored. WEIGHT_BRACKETS is the only thing
 * that decides what counts toward the total, so a new question is outside the
 * score unless it is deliberately listed there. That keeps the total out of 45
 * and every historical week comparable with every new one.
 *
 * Changes, and the reasoning, are in docs/logic.md under "Weekly check-in
 * question revision".
 */

const LOW_THRESHOLD = 5;          // follow-ups trigger at 5 or below
const STRESS_HIGH_THRESHOLD = 6;  // stress follow-up triggers at 6 or above (inverted question)

// A score below this is an Underperforming or Critical week - the bottom two
// SCORE_BANDS. Defined once so the band table and the tough-week follow-up
// below cannot drift apart.
const TOUGH_WEEK_BELOW = 24;

// The opt-out in the help question. Held as a constant because the tough-week
// follow-up matches on it: if the wording were edited in one place only, the
// follow-up would silently stop firing and nothing would fail or log.
const ACCOUNTABILITY_ONLY = 'No, all good, just keep me accountable';

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

  { id: 'biggest_win', kind: 'textarea', number: 2,
    ref: '72dfa035-75f0-4401-be78-84f8cb5da3cf',
    question: 'What was your biggest win this week?' },

  { id: 'training_rating', kind: 'scale', number: 3,
    ref: '522e6339-ef63-49c7-9b95-4d925841afe2',
    question: 'How did your training/cardio go this week?',
    low: 'Way off', mid: 'Could be sharper', high: 'Fully dialled in' },
  { id: 'training_issue', kind: 'textarea', number: '3a',
    ref: '2f62d196-6bc3-4341-a802-a94d617fd28a',
    conditional: { field: 'training_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with training?' },

  { id: 'step_rating', kind: 'scale', number: 4,
    ref: '33b74dae-ec78-4b11-a236-ef7639ae5473',
    question: 'Did you hit your daily step target this week?',
    low: 'Not even close', high: 'Every single day' },
  { id: 'step_issue', kind: 'textarea', number: '4a',
    ref: 'bb208412-8ca5-4467-8602-0ad2d1f7f3ad',
    conditional: { field: 'step_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with steps?' },

  { id: 'nutrition_rating', kind: 'scale', number: 5,
    ref: '88b092a4-e251-47ce-a298-520ef4edc1cc',
    question: 'How would you rate your nutrition this week?',
    low: 'Way off plan', high: 'Fully on plan' },
  { id: 'nutrition_issue', kind: 'textarea', number: '5a',
    ref: '6cdaac53-9eae-4322-a8cc-7a3e0ad6eba3',
    conditional: { field: 'nutrition_rating', op: 'lte', value: LOW_THRESHOLD },
    question: 'What was the issue with nutrition?' },
  // Removed Aug 2026: "Is it an information issue or an execution issue?"
  // (ref f7145682-1cf2-4a81-8206-f899673ff883). Connor's call - the free-text
  // answer above it already says which it was, so it asked him to categorise
  // something he had just read. Historical answers still display: the ref is
  // deliberately kept in overview-parsers.js FIELD_REF_TO_TEXT so past
  // check-ins are unchanged.

  { id: 'days_on_plan', kind: 'choice', number: 6,
    ref: '87aa3c32-a515-4a76-a9d6-257a08bbb893',
    question: 'Roughly how many days this week would you say you were "on plan" with food?',
    options: ['0-1 days', '2-3 days', '4-5 days', '6-7 days'],
    answerType: 'choice' },

  // Asked every week, deliberately, and NOT conditional on a poor nutrition
  // score. The client worth catching is the one who rates nutrition 8/10 -
  // food genuinely on point - and drank fourteen pints. That week is invisible
  // in every other number on this form. Bands rather than a number: a precise
  // figure invites under-reporting, and the band is all the detail needed.
  { id: 'alcohol', kind: 'choice', number: 7,
    ref: 'weekly-alcohol',
    question: 'Roughly how many alcoholic drinks this week?',
    hint: 'A drink = a pint, a glass of wine, or a single spirit.',
    options: ['None', '1-3', '4-7', '8-14', '15+'],
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
    // Wording taken from the EOM report, which prompts with examples. A bare
    // "what was the source of stress?" gets one-word answers.
    question: 'You reported higher stress - was it work, home, or just general pressure?' },

  // Effort, read against progress_direction immediately below it. Neither
  // number matters much on its own; the GAP between them is the signal, and it
  // says what tone to take before a word of text is read:
  //   high effort + regressed  -> frustrated. The quit risk. Never "push harder"
  //   high effort + progressed -> working. Confirm it and leave it alone
  //   low effort  + regressed  -> stuck. Find the blocker, shrink the ask
  //   low effort  + progressed -> coasting. Nudge while it is still going well
  // Unscored on purpose: effort is not performance, and folding it into the
  // total would make new weeks incomparable with every historical one.
  { id: 'effort', kind: 'scale', number: 11,
    ref: 'weekly-effort',
    question: 'How much did you put in this week?',
    low: 'Not my best', high: 'Everything I had' },

  { id: 'progress_direction', kind: 'choice', number: 12,
    ref: '1a1768d8-ed8f-4780-aece-f06e9221e7ad',
    question: 'Do you feel you progressed, regressed, or stayed the same last week?',
    options: ['Progressed', 'Stayed the same', 'Regressed'],
    answerType: 'choice' },

  // Moved from question 2 to here in Aug 2026. Asked first, it was a mood
  // reading taken before the client had thought about training, food or sleep,
  // and it routinely contradicted the detail that followed. Asked after the
  // detail it is a considered answer. The EOM report already asked it late
  // (its question 11 of 15); this brings the weekly into line.
  // The ref is unchanged, so it scores exactly as it always has.
  { id: 'overall_performance', kind: 'scale', number: 13,
    ref: '08a11882-5f58-44a8-9e70-5d108f2aaedc',
    question: 'How would you rate your overall performance this week?',
    low: 'Poor week', high: 'Excellent week' },

  { id: 'help_request', kind: 'multichoice', number: 14,
    ref: '0c8bb709-de48-480e-b4da-8232827200ae',
    question: 'Is there anything specific you want my help with this week?',
    hint: 'Choose as many as you like',
    sections: [
      { heading: null, options: [
        ACCOUNTABILITY_ONLY ] },
      { heading: 'Training', options: [
        "I'm unsure about exercise technique",
        "I'm not confident in how hard to push / progress",
        // Replaced "I'm struggling to fit sessions into my week" (Aug 2026).
        // Same meaning, but it was also duplicated by the old "structuring my
        // routine" option in Lifestyle, splitting the signal across two boxes.
        "I can't see where my sessions fit next week" ] },
        // Removed Aug 2026: "I'm unsure about the overall plan structure".
        // Unactionable - it could mean a two-minute reassurance or a full
        // walkthrough of the block, with no way to tell which. The useful half
        // is now covered by "I want to know if I'm actually on track" below.
      { heading: 'Nutrition', options: [
        'I\'m unclear on what "on plan" looks like',
        'I struggled with evenings/weekends',
        "I'm unsure how to hit protein/calories",
        'I need more ideas for meals/snacks' ] },
      { heading: 'Lifestyle / Recovery', options: [
        'I need help improving my sleep this week',
        'I need help managing stress this week',
        // Replaced "I need help structuring my routine this week" (Aug 2026).
        // The old wording asked Connor to plan a week he could not see. This
        // one names something he can actually do without more information.
        "I've too much on - give me a stripped-back plan for next week" ] },
      // Added Aug 2026. The weekly early warning for the question the EOM
      // report asks monthly ("how confident do you feel about the direction").
      // Deliberately a request Connor can answer from data he already has,
      // rather than an open invitation to criticise the plan - someone who has
      // started to doubt ticks this weeks before they would ever say so.
      { heading: 'Progress', options: [
        "I want to know if I'm actually on track" ] },
    ],
    otherOption: true },

  { id: 'upcoming_notes', kind: 'textarea', number: 15,
    ref: '147c7a86-c8fd-4782-8f45-0995a5dad8e7',
    question: 'Is there anything coming up this week I should know about?' },

  // Fires only when the week scored in the bottom two bands AND the client
  // ticked the opt-out. That combination is the one worth interrupting: the
  // person having a rough week who says nothing is wrong is the person who
  // quietly cancels. Optional, so it never blocks a submission.
  // Placed last because the score is not complete until overall_performance
  // has been answered, which now happens at question 13.
  { id: 'tough_week_prompt', kind: 'textarea', number: 16,
    ref: 'weekly-tough-week',
    conditional: { all: [
      { field: 'help_request', op: 'includes', value: ACCOUNTABILITY_ONLY },
      { op: 'scoreBelow', value: TOUGH_WEEK_BELOW },
    ] },
    question: "Tough week, but you've said you just want accountability - is there anything at all you want me to look at?",
    hint: 'Leave it blank if you would rather not. It will not stop you submitting.' },
];

// Weighted score brackets (raw 1-10 -> weighted 1-5), for admin display only.
// The portal computes scores itself from form_data; these must stay in sync
// with backend/lib/overview-parsers.js.
//
// This table is also what decides which questions are scored at all: anything
// not listed here is outside the total. `effort` is deliberately absent.
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

/**
 * Evaluate a question's `conditional`.
 *
 * Supported shapes:
 *   { field, op: 'lte'|'gte', value }   numeric comparison against an answer
 *   { field, op: 'includes', value }    a multi-select containing a value
 *   { op: 'scoreBelow', value }         the running weighted total, from ctx
 *   { all: [ ...conditions ] }          every one of them must hold
 *
 * `ctx.score` is supplied by the caller because the score is computed in
 * form-data.js, which already has the whole definition. A `scoreBelow`
 * condition is FALSE when no score has been provided, so a caller that does
 * not supply one simply never shows those questions rather than crashing.
 */
function conditionMet(cond, answers, ctx = {}) {
  if (!cond) return true;

  if (Array.isArray(cond.all)) {
    return cond.all.every((c) => conditionMet(c, answers, ctx));
  }

  // Checked before the field lookup - this condition has no field.
  if (cond.op === 'scoreBelow') {
    return typeof ctx.score === 'number' && ctx.score < cond.value;
  }

  const v = answers[cond.field];
  if (v == null) return false;
  if (cond.op === 'includes') return Array.isArray(v) && v.indexOf(cond.value) !== -1;
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
  TOUGH_WEEK_BELOW,
  ACCOUNTABILITY_ONLY,
  conditionMet,
};
