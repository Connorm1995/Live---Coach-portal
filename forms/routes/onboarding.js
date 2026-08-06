/**
 * Public onboarding form: /join
 *
 * No client token - the link is public (Connor emails it to new clients).
 * Drafts are keyed by an anonymous submission UUID held in the browser.
 *
 * Submit pipeline (reliability first):
 *   1. Store the full submission in onboarding_submissions - before anything
 *      else, so no answer set is ever lost.
 *   2. Create the client in Trainerize (/user/add, sendMail: true - Trainerize
 *      emails them their sign-in invite).
 *   3. Create the portal client row. No per-client link is needed - the weekly
 *      and monthly forms are one shared URL each, resolved by name.
 *   4. Mark the submission synced. Any failure after step 1 marks it
 *      sync_failed with the error; the admin area has a Retry button.
 *
 * The client always gets a success screen if step 1 succeeded - a Trainerize
 * hiccup is the coach's problem to retry, not the client's.
 */

const path = require('path');
const express = require('express');
const pool = require('../db/pool');
const def = require('../lib/onboarding-definition');
const { createClient } = require('../lib/trainerize');

const router = express.Router();

const COACH_ID = 1;
const DEFAULT_PROGRAM = 'my_fit_coach';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const WELCOME = {
  title: ', welcome to MyFitCoach.',
  paragraphs: [
    'This is where your coaching starts. The more honest and specific you are here, the better your first plan will be - there are no wrong answers and nothing you write is judged.',
    'It covers your training background, day to day life, and nutrition habits. Nothing is shared with anyone but Connor.',
    'Answers save as you go, so a browser crash won\'t lose anything.',
  ],
  cta: 'Start onboarding',
  time: 'Takes about 10 minutes',
  alreadySubmitted: '',
};

const DONE = {
  title: "That's everything - welcome aboard.",
  sub: 'Your Trainerize invite is on its way to your email (check spam if it has not landed in a few minutes). Connor will review your answers and your plan will follow.',
};

function validateOnboarding(answers) {
  const problems = [];
  for (const q of def.QUESTIONS) {
    if (!def.conditionMet(q.conditional, answers)) continue;
    const v = answers[q.id];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);

    if (empty) {
      if (q.required) problems.push(q.id);
      continue;
    }
    if (q.kind === 'scale') {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1 || n > 10) problems.push(q.id);
    } else if (q.kind === 'choice') {
      if (!q.options.includes(v)) problems.push(q.id);
    } else if (q.kind === 'multichoice') {
      const valid = new Set(q.sections.flatMap((s) => s.options));
      if (!Array.isArray(v) || !v.every((x) => valid.has(x) || x === 'Other')) problems.push(q.id);
    } else if (q.kind === 'email') {
      if (!EMAIL_RE.test(String(v).trim())) problems.push(q.id);
    } else if (q.kind === 'number') {
      const n = parseFloat(v);
      if (!Number.isFinite(n) || (q.min != null && n < q.min) || (q.max != null && n > q.max)) problems.push(q.id);
    } else if (q.kind === 'date') {
      if (!DATE_RE.test(String(v)) || isNaN(new Date(v).getTime())) problems.push(q.id);
    }
  }
  return problems;
}

/**
 * Trainerize + portal sync for a stored submission. Returns the fields to
 * update on the submission row. Never throws - failures come back as
 * { status: 'sync_failed', sync_error }.
 */
async function syncSubmission(answers) {
  try {
    const { trainerizeUserId, overLimit } = await createClient(answers);

    const fullName = `${String(answers.first_name || '').trim()} ${String(answers.surname || '').trim()}`.trim();
    const email = String(answers.email || '').trim();

    // Portal client row (skip if this Trainerize user is already a client)
    let clientId;
    const existing = await pool.query(
      `SELECT id FROM clients WHERE coach_id = $1 AND trainerize_id = $2`,
      [COACH_ID, trainerizeUserId]
    );
    if (existing.rows.length > 0) {
      clientId = existing.rows[0].id;
    } else {
      const ins = await pool.query(
        `INSERT INTO clients (coach_id, trainerize_id, name, email, program, active, pending_setup, trainerize_joined_at)
         VALUES ($1, $2, $3, $4, $5, true, false, now())
         RETURNING id`,
        [COACH_ID, trainerizeUserId, fullName, email, DEFAULT_PROGRAM]
      );
      clientId = ins.rows[0].id;
    }

    // No per-client link is minted: the weekly and monthly forms are one
    // shared URL each, and the client identifies themselves by name at Q1.
    // form_links is left in place unused in case per-client links ever return.

    return {
      status: 'synced',
      trainerize_user_id: trainerizeUserId,
      client_id: clientId,
      sync_error: overLimit ? 'Created, but queued in Trainerize pending list (plan limit reached)' : null,
    };
  } catch (err) {
    console.error('[onboarding sync] Failed:', err.message);
    return { status: 'sync_failed', trainerize_user_id: null, client_id: null, sync_error: err.message };
  }
}

// Page
router.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'checkin.html'));
});

// State - questions + welcome copy + any draft for this browser's UUID
router.get('/api/join/state', async (req, res) => {
  try {
    const uuid = String(req.query.uuid || '');
    let draft = null;
    if (UUID_RE.test(uuid)) {
      const d = await pool.query(
        `SELECT answers FROM onboarding_drafts WHERE submission_uuid = $1`,
        [uuid.toLowerCase()]
      );
      if (d.rows[0]) draft = { answers: d.rows[0].answers, submissionUuid: uuid.toLowerCase() };
    }
    return res.json({
      ok: true,
      firstName: 'there',
      formTitle: 'MyFitCoach Onboarding',
      welcome: WELCOME,
      done: DONE,
      questions: def.QUESTIONS,
      draft,
      submittedThisCycle: false,
    });
  } catch (err) {
    console.error('[join state] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Autosave draft
router.post('/api/join/draft', async (req, res) => {
  try {
    const { answers, submissionUuid } = req.body || {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ ok: false, error: 'bad_answers' });
    }
    if (!UUID_RE.test(submissionUuid || '')) {
      return res.status(400).json({ ok: false, error: 'bad_uuid' });
    }
    await pool.query(
      `INSERT INTO onboarding_drafts (submission_uuid, coach_id, answers, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (submission_uuid)
       DO UPDATE SET answers = EXCLUDED.answers, updated_at = now()`,
      [submissionUuid.toLowerCase(), COACH_ID, JSON.stringify(answers)]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[join draft] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Submit - idempotent on submissionUuid
router.post('/api/join/submit', async (req, res) => {
  try {
    const { answers, submissionUuid } = req.body || {};
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ ok: false, error: 'bad_answers' });
    }
    if (!UUID_RE.test(submissionUuid || '')) {
      return res.status(400).json({ ok: false, error: 'bad_uuid' });
    }

    const missing = validateOnboarding(answers);
    if (missing.length > 0) {
      return res.status(422).json({ ok: false, error: 'incomplete', missing });
    }

    const uuid = submissionUuid.toLowerCase();

    // 1. Store first - the answers are safe from this point no matter what
    const inserted = await pool.query(
      `INSERT INTO onboarding_submissions (coach_id, submission_uuid, answers, status)
       VALUES ($1, $2, $3, 'sync_failed')
       ON CONFLICT (submission_uuid) DO NOTHING
       RETURNING id`,
      [COACH_ID, uuid, JSON.stringify(answers)]
    );

    if (inserted.rows.length === 0) {
      // Retry of an already-received submission - report success, don't re-sync
      return res.json({ ok: true, endScreen: null });
    }
    const submissionId = inserted.rows[0].id;

    // 2-4. Trainerize + portal sync
    const sync = await syncSubmission(answers);
    await pool.query(
      `UPDATE onboarding_submissions
       SET status = $1, trainerize_user_id = $2, client_id = $3, sync_error = $4
       WHERE id = $5`,
      [sync.status, sync.trainerize_user_id, sync.client_id, sync.sync_error, submissionId]
    );

    await pool.query(`DELETE FROM onboarding_drafts WHERE submission_uuid = $1`, [uuid]);

    const name = `${answers.first_name || ''} ${answers.surname || ''}`.trim();
    console.log(`[onboarding] "${name}" submitted (id=${submissionId}, sync=${sync.status}${sync.sync_error ? ', error: ' + sync.sync_error : ''})`);

    return res.json({ ok: true, endScreen: null });
  } catch (err) {
    console.error('[join submit] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = { router, syncSubmission };
