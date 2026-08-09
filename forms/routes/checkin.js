/**
 * Client-facing forms: page + API for the weekly check-in and the EOM report.
 *
 *   GET  /checkin  |  /monthly                 form page (one shared link)
 *   GET  /api/<form>/state                     questions, draft, cycle
 *   POST /api/<form>/draft                     autosave
 *   POST /api/<form>/submit                    final submit
 *
 * Identity model:
 *   There is one public link per form, shared by every client - the same model
 *   Typeform used. The client identifies themselves by typing their name at
 *   question 1, which is matched against the active client list on submit.
 *
 * Reliability model:
 *  - Every answer is saved to form_drafts the moment it is given (autosave),
 *    keyed on a UUID the browser generates, since we do not know who they are.
 *  - Submit validates, resolves the name, and writes to the shared checkins
 *    table, then tells the client it succeeded.
 *  - A name that matches nothing is NOT an error and is never discarded. The
 *    submission goes to unmatched_submissions with its answers intact and the
 *    coach assigns it from the admin area. The client sees the normal success
 *    screen either way - a typo in their name is not their problem to solve.
 *  - The checkins unique index on typeform_response_id ('mfc_<uuid>') makes
 *    submit retries idempotent, so a double-tap can never create duplicates.
 */

const path = require('path');
const express = require('express');
const pool = require('../db/pool');
const { buildFormData, validateAnswers, computeScore } = require('../lib/form-data');
const { FORM_TYPES } = require('../lib/form-types');
const { resolveClient } = require('../lib/match');

const router = express.Router();

const COACH_ID = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Active clients for this coach, for name matching. */
async function activeClients() {
  const result = await pool.query(
    `SELECT id, name FROM clients WHERE coach_id = $1 AND active = true`,
    [COACH_ID]
  );
  return result.rows;
}

// Pages - one shared link per form, no token
router.get('/:form(checkin|monthly)', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'checkin.html'));
});

// State - questions, welcome copy, current cycle, any saved draft.
// `name` is the name this browser remembered from last time; when it resolves
// to a client we can tell them whether they have already submitted this cycle.
router.get('/api/:form(checkin|monthly)/state', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const cycleStart = form.cycleStart();
    const uuid = String(req.query.uuid || '');
    const rememberedName = String(req.query.name || '').trim();

    let draft = null;
    if (UUID_RE.test(uuid)) {
      const d = await pool.query(
        `SELECT answers, submission_uuid FROM form_drafts
         WHERE submission_uuid = $1 AND form_type = $2 AND cycle_start = $3`,
        [uuid.toLowerCase(), form.dbType, cycleStart]
      );
      if (d.rows[0]) {
        draft = { answers: d.rows[0].answers, submissionUuid: d.rows[0].submission_uuid };
      }
    }

    let firstName = '';
    let submittedThisCycle = false;
    if (rememberedName) {
      const { client, matched } = resolveClient(rememberedName, await activeClients());
      if (matched) {
        firstName = client.name.trim().split(/\s+/)[0];
        const submitted = await pool.query(
          `SELECT 1 FROM checkins
           WHERE client_id = $1 AND type = $2 AND cycle_start = $3 LIMIT 1`,
          [client.id, form.dbType, cycleStart]
        );
        submittedThisCycle = submitted.rows.length > 0;
      }
    }

    return res.json({
      ok: true,
      firstName,
      rememberedName,
      formTitle: form.title,
      welcome: form.welcome,
      questions: form.def.QUESTIONS,
      // The browser needs these to work out the running score for itself.
      // One question (the tough-week follow-up) appears based on the total
      // rather than on a single answer, and the client has to know whether to
      // show it BEFORE submitting - the server only scores on the way in.
      // Sent for both forms; the monthly report simply has no such question.
      scoring: {
        weightBrackets: form.def.WEIGHT_BRACKETS,
        daysOnPlanWeights: form.def.DAYS_ON_PLAN_WEIGHTS,
        progressWeights: form.def.PROGRESS_WEIGHTS,
      },
      cycleStart,
      draft,
      submittedThisCycle,
    });
  } catch (err) {
    console.error('[form state] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Autosave draft - called after every answer
router.post('/api/:form(checkin|monthly)/draft', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const { answers, submissionUuid } = req.body || {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ ok: false, error: 'bad_answers' });
    }
    if (!UUID_RE.test(submissionUuid || '')) {
      return res.status(400).json({ ok: false, error: 'bad_uuid' });
    }

    const cycleStart = form.cycleStart();

    await pool.query(
      `INSERT INTO form_drafts (coach_id, client_id, form_type, cycle_start, submission_uuid, answers, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, now())
       ON CONFLICT (submission_uuid)
       DO UPDATE SET answers = EXCLUDED.answers, form_type = EXCLUDED.form_type,
                     cycle_start = EXCLUDED.cycle_start, updated_at = now()`,
      [COACH_ID, form.dbType, cycleStart, submissionUuid.toLowerCase(), JSON.stringify(answers)]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[form draft] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Final submit - idempotent on submissionUuid
router.post('/api/:form(checkin|monthly)/submit', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const { answers, submissionUuid } = req.body || {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ ok: false, error: 'bad_answers' });
    }
    if (!UUID_RE.test(submissionUuid || '')) {
      return res.status(400).json({ ok: false, error: 'bad_uuid' });
    }

    const missing = validateAnswers(form.def, answers);
    if (missing.length > 0) {
      return res.status(422).json({ ok: false, error: 'incomplete', missing });
    }

    const cycleStart = form.cycleStart();
    const formData = buildFormData(form.def, answers);
    const uuid = submissionUuid.toLowerCase();
    const responseId = `mfc_${uuid}`;
    const submittedName = String(answers.client_name || '').trim();

    const { client, bestMatch, matched, score } = resolveClient(submittedName, await activeClients());

    if (matched) {
      await pool.query(
        `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, cycle_start, form_data)
         VALUES ($1, $2, $3, $4, now(), false, $5, $6)
         ON CONFLICT (typeform_response_id) DO NOTHING`,
        [COACH_ID, client.id, form.dbType, responseId, cycleStart, JSON.stringify(formData)]
      );
      console.log(
        `[form submit] "${submittedName}" -> "${client.name}" (${(score * 100).toFixed(1)}%) ` +
        `${form.dbType} stored (cycle ${cycleStart}, ${responseId})`
      );
    } else {
      // Nothing matched well enough. Store it whole so the coach can assign it.
      await pool.query(
        `INSERT INTO unmatched_submissions
           (coach_id, form_type, cycle_start, submission_uuid, submitted_name,
            best_match_client_id, best_match_score, answers, form_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (submission_uuid) DO NOTHING`,
        [
          COACH_ID, form.dbType, cycleStart, uuid, submittedName,
          bestMatch ? bestMatch.id : null, score ? score.toFixed(3) : null,
          JSON.stringify(answers), JSON.stringify(formData),
        ]
      );
      console.warn(
        `[form submit] UNMATCHED "${submittedName}" (best ${(score * 100).toFixed(1)}%` +
        `${bestMatch ? ', ' + bestMatch.name : ''}) - held for assignment (${form.dbType}, cycle ${cycleStart})`
      );
    }

    await pool.query(`DELETE FROM form_drafts WHERE submission_uuid = $1`, [uuid]);

    // Score-based end screen (server-authoritative, same on retries).
    // Shown whether or not the name matched - that is the coach's problem.
    const { total } = computeScore(form.def, answers);
    const screen = total != null ? form.def.END_SCREENS.find((s) => total >= s.min) : null;
    return res.json({
      ok: true,
      endScreen: screen
        ? { key: screen.key, label: screen.label, color: screen.color, messages: screen.messages }
        : null,
    });
  } catch (err) {
    console.error('[form submit] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
