/**
 * Converts a submitted answers object ({ question_id: value }) into the
 * Typeform-shaped answers array stored in checkins.form_data, and computes
 * the weighted score for admin display.
 *
 * Every function takes a form definition (checkin-definition.js or
 * eom-definition.js) so the weekly and EOM forms share one engine.
 *
 * The output shape matches what the Typeform webhook stored for 1,000+
 * historical check-ins, so the portal's overview-parsers.js reads new and
 * old submissions identically.
 */

/**
 * Context passed to conditionMet, for conditions that depend on the running
 * score rather than on a single answer (the tough-week follow-up).
 *
 * Returns an empty context for definitions that have no scoring at all, such
 * as onboarding. A score condition evaluated without a score is simply false,
 * so those forms behave exactly as they did before.
 */
function scoreContext(def, answers) {
  if (!def.WEIGHT_BRACKETS) return {};
  return { score: computeScore(def, answers).total };
}

/**
 * Build the Typeform-shape answers array from a plain answers object.
 * Conditional questions whose trigger is not met are excluded even if a
 * stale draft value exists (e.g. client lowered then raised a score).
 */
function buildFormData(def, answers) {
  const out = [];
  const ctx = scoreContext(def, answers);

  for (const q of def.QUESTIONS) {
    if (!def.conditionMet(q.conditional, answers, ctx)) continue;
    const value = answers[q.id];
    if (value == null || value === '') continue;

    if (q.kind === 'scale') {
      const n = parseInt(value, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) continue;
      out.push({
        type: 'number',
        number: n,
        field: { id: q.ref, ref: q.ref, type: 'opinion_scale' },
      });
    } else if (q.kind === 'choice' && q.answerType === 'choice') {
      if (!q.options.includes(value)) continue;
      out.push({
        type: 'choice',
        choice: { label: value },
        field: { id: q.ref, ref: q.ref, type: 'multiple_choice' },
      });
    } else if (q.kind === 'multichoice') {
      // Multi-select: stored in Typeform's 'choices' shape (labels array).
      // A selected "Other" carries the client's free text inline.
      const valid = new Set(q.sections.flatMap((s) => s.options));
      const selected = (Array.isArray(value) ? value : []).filter(
        (v) => valid.has(v) || v === 'Other'
      );
      const labels = selected.filter((v) => v !== 'Other');
      if (selected.includes('Other')) {
        const otherText = String(answers[q.id + '_other'] || '').trim();
        labels.push(otherText ? `Other: ${otherText}` : 'Other');
      }
      if (labels.length === 0) continue;
      out.push({
        type: 'choices',
        choices: { labels },
        field: { id: q.ref, ref: q.ref, type: 'multiple_choice' },
      });
    } else {
      // textarea, and choice questions stored as text (nutrition info vs execution)
      const text = String(value).trim();
      if (!text) continue;
      if (q.kind === 'choice' && !q.options.includes(text)) continue;
      // fieldType lets a question pin its Typeform field type explicitly - the
      // name question is a short_text so it matches the historical records.
      const fieldType = q.fieldType || (q.kind === 'choice' ? 'multiple_choice' : 'long_text');
      out.push({
        type: 'text',
        text,
        field: { id: q.ref, ref: q.ref, type: fieldType },
      });
    }
  }

  return out;
}

/**
 * Validate a raw answers object. Returns a list of problems (empty = valid).
 * All scored/scale/choice questions whose conditions are met must be
 * answered; free-text questions and the multi-select may be left blank.
 */
function validateAnswers(def, answers) {
  const problems = [];
  const ctx = scoreContext(def, answers);
  for (const q of def.QUESTIONS) {
    if (!def.conditionMet(q.conditional, answers, ctx)) continue;
    const value = answers[q.id];
    // Explicitly required questions (the name) must be answered whatever their
    // kind. Everything else keeps the original rule: scales and choices are
    // mandatory, free text is optional.
    if (q.required) {
      const empty = value == null || String(value).trim() === '';
      if (empty) { problems.push(q.id); continue; }
    }
    if (q.kind === 'scale') {
      const n = parseInt(value, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) problems.push(q.id);
    } else if (q.kind === 'choice') {
      if (!q.options.includes(value)) problems.push(q.id);
    }
  }
  return problems;
}

/** Weighted score for admin display and end screens. */
function computeScore(def, answers) {
  let total = 0;
  let count = 0;

  for (const [id, bracket] of Object.entries(def.WEIGHT_BRACKETS)) {
    const n = parseInt(answers[id], 10);
    if (Number.isInteger(n) && n >= 1 && n <= 10) {
      total += bracket[n - 1];
      count++;
    }
  }
  if (def.DAYS_ON_PLAN_WEIGHTS[answers.days_on_plan] != null) {
    total += def.DAYS_ON_PLAN_WEIGHTS[answers.days_on_plan];
    count++;
  }
  if (def.PROGRESS_WEIGHTS[answers.progress_direction] != null) {
    total += def.PROGRESS_WEIGHTS[answers.progress_direction];
    count++;
  }

  if (count < 5) return { total: null, band: null };
  const band = def.SCORE_BANDS.find((b) => total >= b.min);
  return { total, band: band ? band.label : null };
}

module.exports = { buildFormData, validateAnswers, computeScore };
