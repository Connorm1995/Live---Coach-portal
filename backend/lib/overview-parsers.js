/**
 * overview-parsers.js
 *
 * Shared constants and parsers for Typeform check-in score/answer extraction.
 * Used by both overview.js and client-overview.js.
 */

// Weighted score bracket tables (raw 1-10 -> weighted 1-5)
const WEIGHT_BRACKETS = {
  overall:   [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  training:  [1, 1, 2, 2, 2, 3, 3, 4, 5, 5],
  steps:     [1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
  nutrition: [1, 1, 2, 2, 3, 4, 4, 5, 5, 5],
  sleep:     [1, 1, 1, 1, 2, 2, 3, 4, 5, 5],
  digestion: [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
  stress:    [5, 5, 5, 5, 4, 3, 3, 2, 2, 2], // INVERTED
};

// The EOM report weights two categories differently (verified against
// Typeform's own calculated scores - see connor-eom-report-reference.md):
// training raw 5/7 score higher, stress raw 6 scores 4 instead of 3.
const WEIGHT_BRACKETS_EOM = {
  ...WEIGHT_BRACKETS,
  training: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  stress:   [5, 5, 5, 5, 4, 4, 3, 2, 2, 2], // INVERTED
};

const DAYS_ON_PLAN_WEIGHTS = { '0-1 days': 1, '2-3 days': 2, '4-5 days': 4, '6-7 days': 5 };
const PROGRESS_WEIGHTS = { 'Progressed': 5, 'Stayed the same': 3, 'Regressed': 1 };

const SCORE_CATEGORIES = ['overall', 'training', 'steps', 'nutrition', 'sleep', 'digestion', 'stress'];

// Field ref -> score category (from connor-weekly-checkin-reference.md)
// The End of Month report (Core clients) uses readable refs that map onto the
// same score categories, so both check-in types parse into one shape.
const FIELD_REF_TO_SCORE = {
  // Weekly check-in (UUID refs)
  '08a11882-5f58-44a8-9e70-5d108f2aaedc': 'overall',
  '522e6339-ef63-49c7-9b95-4d925841afe2': 'training',
  '33b74dae-ec78-4b11-a236-ef7639ae5473': 'steps',
  '88b092a4-e251-47ce-a298-520ef4edc1cc': 'nutrition',
  'b56a1664-564e-4046-a1f0-b4502c5c613e': 'sleep',
  'b4ec8f22-da73-4b69-9d13-bbde511d7b5e': 'digestion',
  '1f75d0a7-b810-4f00-821a-e8151e27d8fe': 'stress',
  // End of Month report (semantic refs)
  'eom-overall-performance': 'overall',
  'eom-training-rating':     'training',
  'eom-step-rating':         'steps',
  'eom-nutrition-rating':    'nutrition',
  'eom-sleep-rating':        'sleep',
  'eom-digestion-rating':    'digestion',
  'eom-stress-rating':       'stress',
};

const FIELD_REF_DAYS_ON_PLAN = '87aa3c32-a515-4a76-a9d6-257a08bbb893';
const FIELD_REF_PROGRESS     = '1a1768d8-ed8f-4780-aece-f06e9221e7ad';

// A choice ref may come from either the weekly or the EOM form.
const DAYS_ON_PLAN_REFS = new Set([FIELD_REF_DAYS_ON_PLAN, 'eom-days-on-plan']);
const PROGRESS_REFS     = new Set([FIELD_REF_PROGRESS, 'eom-progress-direction']);

// Field ref -> text answer key (open text + all conditional follow-ups)
const FIELD_REF_TO_TEXT = {
  // Weekly check-in
  '72dfa035-75f0-4401-be78-84f8cb5da3cf': 'wins',
  '6f1349a2-e67a-42e5-90ca-48752037f4c6': 'stressSource',
  '0c8bb709-de48-480e-b4da-8232827200ae': 'helpNeeded',
  '147c7a86-c8fd-4782-8f45-0995a5dad8e7': 'upcomingEvents',
  '2f62d196-6bc3-4341-a802-a94d617fd28a': 'trainingIssue',
  'bb208412-8ca5-4467-8602-0ad2d1f7f3ad': 'stepIssue',
  '6cdaac53-9eae-4322-a8cc-7a3e0ad6eba3': 'nutritionIssue',
  // Retired from the live form in Aug 2026 but KEPT here on purpose: over a
  // thousand historical check-ins carry this answer, and removing the mapping
  // would blank it out on every one of them.
  'f7145682-1cf2-4a81-8206-f899673ff883': 'nutritionInfoVsExec',
  'c26c1eb4-ce78-4f8d-9542-c3d0a168ae94': 'sleepIssue',
  'c3d0c143-ea9e-4f0a-a8cb-9306e24c1517': 'digestionIssue',
  // Added to the weekly check-in Aug 2026. Readable refs, not UUIDs - these
  // never existed in Typeform so there is no historical shape to match.
  'weekly-alcohol':    'alcohol',
  'weekly-tough-week': 'toughWeekNote',
  // End of Month report (shared keys reuse the same panel fields)
  'eom-biggest-win':    'wins',
  'eom-stress-source':  'stressSource',
  'eom-help-request':   'helpNeeded',
  'eom-upcoming-notes': 'upcomingEvents',
  'eom-hindsight':      'hindsight',       // EOM-only
};

// Numeric fields surfaced as a text answer (e.g. "7/10") rather than scored.
// Confidence is EOM-only; effort is weekly-only and deliberately outside the
// weekly total, so that adding it did not shift the score or make new weeks
// incomparable with historical ones.
const FIELD_REF_DIRECTION_CONFIDENCE = 'eom-direction-confidence';
const FIELD_REF_EFFORT = 'weekly-effort';

// All known answer keys - parseFormAnswers returns null for unanswered fields.
// Includes keys only one form asks, so the other reports them as null (hidden).
const ALL_TEXT_KEYS = [...new Set([
  ...Object.values(FIELD_REF_TO_TEXT), 'directionConfidence', 'effort',
])];

function toWeighted(category, rawValue, brackets = WEIGHT_BRACKETS) {
  const bracket = brackets[category];
  if (!bracket || rawValue < 1 || rawValue > 10) return null;
  return bracket[rawValue - 1];
}

function parseScores(formData) {
  if (!formData || !Array.isArray(formData)) return null;

  // EOM submissions use eom-* refs and slightly different weight brackets
  const isEom = formData.some((a) => a.field && a.field.ref && a.field.ref.startsWith('eom-'));
  const brackets = isEom ? WEIGHT_BRACKETS_EOM : WEIGHT_BRACKETS;

  const raw = {};
  const weighted = {};
  let daysOnPlan = null;
  let daysOnPlanWeighted = null;
  let progressDirection = null;
  let progressWeighted = null;

  for (const answer of formData) {
    const ref = answer.field?.ref;

    // Scale questions (opinion_scale 1-10) - lookup by field ref
    const cat = FIELD_REF_TO_SCORE[ref];
    if (cat && answer.number != null) {
      raw[cat] = answer.number;
      weighted[cat] = toWeighted(cat, answer.number, brackets);
    }

    // Choice questions - lookup by field ref (weekly or EOM)
    if (answer.type === 'choice' && answer.choice?.label) {
      const label = answer.choice.label;
      if (DAYS_ON_PLAN_REFS.has(ref)) {
        daysOnPlan = label;
        daysOnPlanWeighted = DAYS_ON_PLAN_WEIGHTS[label] || null;
      } else if (PROGRESS_REFS.has(ref)) {
        progressDirection = label;
        progressWeighted = PROGRESS_WEIGHTS[label] || null;
      }
    }
  }

  if (Object.keys(raw).length === 0) return null;

  // Calculate total weighted score out of 45
  let totalWeighted = 0;
  let countScored = 0;
  for (const cat of SCORE_CATEGORIES) {
    if (weighted[cat] != null) {
      totalWeighted += weighted[cat];
      countScored++;
    }
  }
  if (daysOnPlanWeighted != null) { totalWeighted += daysOnPlanWeighted; countScored++; }
  if (progressWeighted != null) { totalWeighted += progressWeighted; countScored++; }

  // Need at least 5 scored fields for a valid total
  const totalValid = countScored >= 5;

  return {
    raw,
    weighted,
    daysOnPlan,
    daysOnPlanWeighted,
    progressDirection,
    progressWeighted,
    totalWeighted: totalValid ? totalWeighted : null,
    maxTotal: 45,
    // Legacy compat: keep individual category values at top level for trend access
    ...raw,
  };
}

function parseFormAnswers(formData) {
  if (!formData || !Array.isArray(formData)) return null;

  // Start with every known text key set to null
  const answers = {};
  for (const key of ALL_TEXT_KEYS) answers[key] = null;

  for (const answer of formData) {
    const ref = answer.field?.ref;
    const cat = FIELD_REF_TO_TEXT[ref];
    if (cat && answer.type === 'text') {
      answers[cat] = answer.text || null;
    }
    // Also capture multi-choice text (helpNeeded uses 'choices' type)
    if (cat && answer.type === 'choices' && answer.choices?.labels) {
      answers[cat] = answer.choices.labels.join(', ') || null;
    }
    // Single-choice answers (the weekly alcohol bands). Only fires for refs in
    // FIELD_REF_TO_TEXT, so days-on-plan and progress direction are unaffected
    // - those are scored in parseScores and must not be duplicated here.
    if (cat && answer.type === 'choice' && answer.choice?.label) {
      answers[cat] = answer.choice.label;
    }
    // Ratings surfaced as text rather than scored
    if (ref === FIELD_REF_DIRECTION_CONFIDENCE && answer.number != null) {
      answers.directionConfidence = `${answer.number}/10`;
    }
    if (ref === FIELD_REF_EFFORT && answer.number != null) {
      answers.effort = `${answer.number}/10`;
    }
  }

  return answers;
}

module.exports = {
  WEIGHT_BRACKETS,
  WEIGHT_BRACKETS_EOM,
  DAYS_ON_PLAN_WEIGHTS,
  PROGRESS_WEIGHTS,
  SCORE_CATEGORIES,
  FIELD_REF_TO_SCORE,
  FIELD_REF_DAYS_ON_PLAN,
  FIELD_REF_PROGRESS,
  FIELD_REF_EFFORT,
  FIELD_REF_TO_TEXT,
  ALL_TEXT_KEYS,
  toWeighted,
  parseScores,
  parseFormAnswers,
};
