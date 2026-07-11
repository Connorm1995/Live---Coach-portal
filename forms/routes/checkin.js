/**
 * Client-facing forms: page + API for the weekly check-in and the EOM report.
 *
 *   GET  /checkin/<token>  |  /monthly/<token>          form page
 *   GET  /api/<form>/<token>/state                      questions, draft, name
 *   POST /api/<form>/<token>/draft                      autosave
 *   POST /api/<form>/<token>/submit                     final submit
 *
 * Reliability model:
 *  - Every answer is saved to form_drafts the moment it is given (autosave).
 *  - Submit validates, writes to the shared checkins table, and only then
 *    tells the client it succeeded.
 *  - The client generates a submission UUID on first load; the checkins
 *    unique index on typeform_response_id ('mfc_<uuid>') makes submit retries
 *    idempotent - a double-tap or network retry can never create duplicates.
 */

const path = require('path');
const express = require('express');
const pool = require('../db/pool');
const { buildFormData, validateAnswers, computeScore } = require('../lib/form-data');
const { FORM_TYPES } = require('../lib/form-types');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lookupToken(token) {
  const result = await pool.query(
    `SELECT fl.coach_id, fl.client_id, c.name
     FROM form_links fl
     JOIN clients c ON c.id = fl.client_id
     WHERE fl.token = $1 AND fl.active = true AND c.active = true`,
    [token]
  );
  return result.rows[0] || null;
}

// Pages - served for valid tokens; friendly error page otherwise
router.get('/:form(checkin|monthly)/:token', async (req, res) => {
  try {
    const link = await lookupToken(req.params.token);
    if (!link) {
      return res.status(404).sendFile(path.join(__dirname, '..', 'public', 'link-invalid.html'));
    }
    return res.sendFile(path.join(__dirname, '..', 'public', 'checkin.html'));
  } catch (err) {
    console.error('[form page] Error:', err.message);
    return res.status(500).sendFile(path.join(__dirname, '..', 'public', 'link-invalid.html'));
  }
});

// State - client name, questions, welcome copy, current cycle, any saved draft
router.get('/api/:form(checkin|monthly)/:token/state', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const link = await lookupToken(req.params.token);
    if (!link) return res.status(404).json({ ok: false, error: 'invalid_link' });

    const cycleStart = form.cycleStart();

    const draft = await pool.query(
      `SELECT answers, submission_uuid FROM form_drafts
       WHERE client_id = $1 AND form_type = $2 AND cycle_start = $3`,
      [link.client_id, form.dbType, cycleStart]
    );

    const submitted = await pool.query(
      `SELECT 1 FROM checkins
       WHERE client_id = $1 AND type = $2 AND cycle_start = $3
       LIMIT 1`,
      [link.client_id, form.dbType, cycleStart]
    );

    return res.json({
      ok: true,
      firstName: link.name.trim().split(/\s+/)[0],
      formTitle: form.title,
      welcome: form.welcome,
      questions: form.def.QUESTIONS,
      cycleStart,
      draft: draft.rows[0]
        ? { answers: draft.rows[0].answers, submissionUuid: draft.rows[0].submission_uuid }
        : null,
      submittedThisCycle: submitted.rows.length > 0,
    });
  } catch (err) {
    console.error('[form state] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Autosave draft - called after every answer
router.post('/api/:form(checkin|monthly)/:token/draft', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const link = await lookupToken(req.params.token);
    if (!link) return res.status(404).json({ ok: false, error: 'invalid_link' });

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
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (client_id, form_type, cycle_start)
       DO UPDATE SET answers = EXCLUDED.answers, submission_uuid = EXCLUDED.submission_uuid, updated_at = now()`,
      [link.coach_id, link.client_id, form.dbType, cycleStart, submissionUuid, JSON.stringify(answers)]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[form draft] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Final submit - idempotent on submissionUuid
router.post('/api/:form(checkin|monthly)/:token/submit', async (req, res) => {
  try {
    const form = FORM_TYPES[req.params.form];
    const link = await lookupToken(req.params.token);
    if (!link) return res.status(404).json({ ok: false, error: 'invalid_link' });

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
    const responseId = `mfc_${submissionUuid.toLowerCase()}`;

    await pool.query(
      `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, cycle_start, form_data)
       VALUES ($1, $2, $3, $4, now(), false, $5, $6)
       ON CONFLICT (typeform_response_id) DO NOTHING`,
      [link.coach_id, link.client_id, form.dbType, responseId, cycleStart, JSON.stringify(formData)]
    );
    // Conflict = this exact submission already landed (client retry) - success either way.

    await pool.query(
      `DELETE FROM form_drafts
       WHERE client_id = $1 AND form_type = $2 AND cycle_start = $3`,
      [link.client_id, form.dbType, cycleStart]
    );

    console.log(`[form submit] "${link.name}" ${form.dbType} stored (cycle ${cycleStart}, ${responseId})`);

    // Score-based end screen (server-authoritative, same on retries)
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
