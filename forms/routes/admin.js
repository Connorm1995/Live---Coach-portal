/**
 * Coach admin area - the Typeform "Responses" replacement.
 *
 * Password-protected (FORMS_ADMIN_PASSWORD). Lists every submission from the
 * shared checkins table (Typeform-era and new alike), with per-client and
 * per-type filters, a full answer detail view, and CSV export.
 *
 * All times are displayed in Europe/Dublin and labelled "(Dublin time)".
 */

const express = require('express');
const pool = require('../db/pool');
const weeklyDef = require('../lib/checkin-definition');
const eomDef = require('../lib/eom-definition');
const onboardingDef = require('../lib/onboarding-definition');
const { computeScore } = require('../lib/form-data');
const { syncSubmission } = require('./onboarding');

const DEFS = { weekly: weeklyDef, eom_report: eomDef };
const {
  requireAdmin,
  isAuthed,
  passwordMatches,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/auth');

const router = express.Router();
const COACH_ID = 1;

// Field ref -> question, across both forms (covers new submissions and
// Typeform history - same refs). Refs are unique between the two forms.
const REF_TO_QUESTION = {};
for (const def of Object.values(DEFS)) {
  for (const q of def.QUESTIONS) REF_TO_QUESTION[q.ref] = q;
}

// Typeform-era refs that are not part of the current definitions
const LEGACY_REF_LABELS = {
  'be65ced6-dd03-44dd-86a8-e09d7d48f334': 'Name (as typed on Typeform)',
  'eom-name': 'Name (as typed on Typeform)',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const dublinFmt = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
function dublin(ts) {
  return ts ? dublinFmt.format(new Date(ts)) : '';
}

function isoDate(d) {
  if (!d) return '';
  // pg returns DATE columns as local-midnight Date objects - read them in
  // local time or the day shifts during Irish summer time
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Rebuild { question_id: value } from a stored form_data answers array. */
function answersFromFormData(formData) {
  const answers = {};
  if (!Array.isArray(formData)) return answers;
  for (const a of formData) {
    const q = REF_TO_QUESTION[a.field && a.field.ref];
    if (!q) continue;
    if (a.number != null) answers[q.id] = a.number;
    else if (a.type === 'choice' && a.choice) answers[q.id] = a.choice.label;
    else if (a.type === 'choices' && a.choices) answers[q.id] = (a.choices.labels || []).join(', ');
    else if (a.type === 'text') answers[q.id] = a.text;
  }
  return answers;
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>${esc(title)} - MyFitCoach Forms</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --black: #000000; --slate: #555e62; --teal: #23b8b8; --teal-bright: #12dacb;
    --white: #ffffff; --off-white: #f5f6f7; --border: #e2e5e8;
    --green: #22c55e; --amber: #f59e0b; --red: #ef4444;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: var(--white); color: var(--black); }
  .topbar {
    height: 56px; background: var(--black); color: var(--white);
    display: flex; align-items: center; padding: 0 24px; gap: 24px;
  }
  .topbar .brand { font-weight: 700; font-size: 15px; }
  .topbar .brand span { color: var(--teal); }
  .topbar .label { font-size: 14px; color: #9aa3a7; }
  .topbar .navlink { color: #9aa3a7; font-size: 14px; text-decoration: none; }
  .topbar .navlink:hover { color: var(--white); }
  .topbar .navlink--active { color: var(--white); border-bottom: 2px solid var(--teal); padding-bottom: 2px; }
  .topbar a:last-child { margin-left: auto; color: #9aa3a7; font-size: 13px; text-decoration: none; }
  .topbar a:last-child:hover { color: var(--white); }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
  .sub { font-size: 13px; color: var(--slate); margin-bottom: 24px; }
  .filters { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
  select, input[type="password"] {
    font-family: 'DM Sans', sans-serif; font-size: 14px;
    padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--white);
  }
  .btn {
    display: inline-block; background: var(--teal); color: var(--white);
    border: none; border-radius: 8px; padding: 10px 18px;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; text-decoration: none;
  }
  .btn:hover { background: var(--teal-bright); }
  .btn--ghost { background: var(--white); color: var(--black); border: 1px solid var(--border); }
  .btn--ghost:hover { background: var(--off-white); }
  table { width: 100%; border-collapse: collapse; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  th {
    text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--slate); font-weight: 500; padding: 12px 16px;
    background: var(--off-white); border-bottom: 1px solid var(--border);
  }
  td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  tr.row:hover td { background: var(--off-white); cursor: pointer; }
  .pill {
    display: inline-block; border-radius: 20px; padding: 3px 12px;
    font-size: 12px; font-weight: 500;
  }
  .pill--weekly { background: #e6f7f7; color: #0f7070; }
  .pill--eom { background: #eff6ff; color: #1e40af; }
  .pill--source { background: var(--off-white); color: var(--slate); }
  .pill--synced { background: #f0fdf4; color: #15803d; }
  .pill--failed { background: #fef2f2; color: #b91c1c; }
  .sync-error {
    background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
    border-radius: 10px; padding: 12px 16px; font-size: 14px; margin-bottom: 24px;
  }
  .score { font-weight: 700; }
  .qa { border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .qa .q { font-size: 13px; color: var(--slate); margin-bottom: 6px; }
  .qa .a { font-size: 16px; line-height: 1.5; white-space: pre-wrap; }
  .meta-grid { display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 24px; }
  .meta-grid .item .k { font-size: 12px; color: var(--slate); text-transform: uppercase; letter-spacing: 0.06em; }
  .meta-grid .item .v { font-size: 18px; font-weight: 600; margin-top: 2px; }
  .empty { padding: 48px; text-align: center; color: var(--slate); font-size: 15px; }
  .login-card { max-width: 380px; margin: 96px auto; border: 1px solid var(--border); border-radius: 14px; padding: 32px; }
  .login-card h1 { margin-bottom: 16px; }
  .login-card form { display: flex; flex-direction: column; gap: 12px; }
  .error { color: var(--red); font-size: 14px; margin-bottom: 8px; }
  .backlink { font-size: 14px; color: var(--slate); text-decoration: none; display: inline-block; margin-bottom: 16px; }
  .backlink:hover { color: var(--black); }
</style>
</head>
<body>${body}</body>
</html>`;
}

function topbar(active) {
  const link = (href, label, key) =>
    `<a class="navlink${active === key ? ' navlink--active' : ''}" href="${href}">${label}</a>`;
  return `<div class="topbar">
    <span class="brand">MY<span>FIT</span>COACH</span>
    ${link('/admin', 'Check-ins', 'checkins')}
    ${link('/admin/onboarding', 'Onboarding', 'onboarding')}
    <a href="/admin/logout">Log out</a>
  </div>`;
}

// ---- Login ----

router.get('/admin/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  const failed = req.query.failed === '1';
  res.send(page('Log in', `
    <div class="login-card">
      <h1>Forms admin</h1>
      ${failed ? '<div class="error">Wrong password - try again.</div>' : ''}
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Password" autofocus required />
        <button class="btn" type="submit">Log in</button>
      </form>
    </div>`));
});

router.post('/admin/login', express.urlencoded({ extended: false }), (req, res) => {
  if (passwordMatches((req.body || {}).password || '')) {
    setSessionCookie(res);
    return res.redirect('/admin');
  }
  return res.redirect('/admin/login?failed=1');
});

router.get('/admin/logout', (req, res) => {
  clearSessionCookie(res);
  res.redirect('/admin/login');
});

// ---- Responses list ----

async function queryCheckins({ clientId, type, limit }) {
  const params = [COACH_ID];
  let where = 'ch.coach_id = $1';
  if (clientId) { params.push(clientId); where += ` AND ch.client_id = $${params.length}`; }
  if (type) { params.push(type); where += ` AND ch.type = $${params.length}`; }
  params.push(limit);
  const result = await pool.query(
    `SELECT ch.id, ch.type, ch.submitted_at, ch.cycle_start, ch.typeform_response_id, ch.form_data,
            c.name AS client_name
     FROM checkins ch
     JOIN clients c ON c.id = ch.client_id
     WHERE ${where}
     ORDER BY ch.submitted_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id, 10) || null;
    const type = ['weekly', 'eom_report'].includes(req.query.type) ? req.query.type : null;

    const [rows, clients] = await Promise.all([
      queryCheckins({ clientId, type, limit: 200 }),
      pool.query(
        `SELECT id, name FROM clients WHERE coach_id = $1 AND active = true ORDER BY name`,
        [COACH_ID]
      ),
    ]);

    const clientOptions = clients.rows.map((c) =>
      `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');

    const tableRows = rows.map((r) => {
      const answers = answersFromFormData(r.form_data);
      const score = DEFS[r.type] ? computeScore(DEFS[r.type], answers) : { total: null };
      const source = (r.typeform_response_id || '').startsWith('mfc_') ? 'MFC form' : 'Typeform';
      return `<tr class="row" onclick="window.location='/admin/checkin/${r.id}'">
        <td>${dublin(r.submitted_at)}</td>
        <td>${esc(r.client_name)}</td>
        <td><span class="pill pill--${r.type === 'weekly' ? 'weekly' : 'eom'}">${r.type === 'weekly' ? 'Weekly' : 'EOM report'}</span></td>
        <td class="score">${score.total != null ? score.total + ' / 45' : '-'}</td>
        <td><span class="pill pill--source">${source}</span></td>
      </tr>`;
    }).join('');

    const exportQs = new URLSearchParams();
    if (clientId) exportQs.set('client_id', clientId);
    if (type) exportQs.set('type', type);

    res.send(page('Responses', `
      ${topbar('checkins')}
      <div class="wrap">
        <h1>Check-in responses</h1>
        <div class="sub">Times shown in Europe/Dublin (Dublin time). Showing the most recent 200 for the current filter.</div>
        <form class="filters" method="GET" action="/admin">
          <select name="client_id" onchange="this.form.submit()">
            <option value="">All clients</option>
            ${clientOptions}
          </select>
          <select name="type" onchange="this.form.submit()">
            <option value="">All types</option>
            <option value="weekly" ${type === 'weekly' ? 'selected' : ''}>Weekly check-in</option>
            <option value="eom_report" ${type === 'eom_report' ? 'selected' : ''}>End of month report</option>
          </select>
          <a class="btn btn--ghost" href="/admin/export.csv?${exportQs.toString()}">Download CSV</a>
        </form>
        ${rows.length === 0
          ? '<div class="empty">No check-ins match this filter.</div>'
          : `<table>
              <tr><th>Submitted (Dublin time)</th><th>Client</th><th>Type</th><th>Score</th><th>Source</th></tr>
              ${tableRows}
            </table>`}
      </div>`));
  } catch (err) {
    console.error('[admin list] Error:', err.message);
    res.status(500).send(page('Error', '<div class="wrap"><h1>Something went wrong</h1></div>'));
  }
});

// ---- Detail view ----

router.get('/admin/checkin/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ch.*, c.name AS client_name
       FROM checkins ch JOIN clients c ON c.id = ch.client_id
       WHERE ch.id = $1 AND ch.coach_id = $2`,
      [parseInt(req.params.id, 10) || 0, COACH_ID]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).send(page('Not found', '<div class="wrap"><h1>Check-in not found</h1></div>'));

    const answers = answersFromFormData(row.form_data);
    const def = DEFS[row.type] || weeklyDef;
    const score = computeScore(def, answers);

    // Answered questions in form order, then any legacy/unknown refs
    const blocks = [];
    for (const q of def.QUESTIONS) {
      const v = answers[q.id];
      if (v == null || v === '') continue;
      blocks.push(`<div class="qa"><div class="q">${q.number ? q.number + '. ' : ''}${esc(q.question)}</div><div class="a">${esc(v)}</div></div>`);
    }
    if (Array.isArray(row.form_data)) {
      for (const a of row.form_data) {
        const ref = a.field && a.field.ref;
        if (REF_TO_QUESTION[ref]) continue;
        const label = LEGACY_REF_LABELS[ref] || `Other field (${ref})`;
        const value = a.text != null ? a.text : a.number != null ? a.number : a.choice ? a.choice.label : '';
        if (value === '' || value == null) continue;
        blocks.push(`<div class="qa"><div class="q">${esc(label)}</div><div class="a">${esc(value)}</div></div>`);
      }
    }

    res.send(page(`${row.client_name} check-in`, `
      ${topbar('checkins')}
      <div class="wrap">
        <a class="backlink" href="/admin">&larr; All responses</a>
        <h1>${esc(row.client_name)}</h1>
        <div class="sub">${row.type === 'weekly' ? 'Weekly check-in' : 'End of month report'} - submitted ${dublin(row.submitted_at)} (Dublin time)</div>
        <div class="meta-grid">
          ${score.total != null ? `<div class="item"><div class="k">Score</div><div class="v">${score.total} / 45</div></div>` : ''}
          ${score.band ? `<div class="item"><div class="k">Band</div><div class="v">${esc(score.band)}</div></div>` : ''}
          <div class="item"><div class="k">Week starting</div><div class="v">${isoDate(row.cycle_start)}</div></div>
        </div>
        ${blocks.join('') || '<div class="empty">No answer data stored for this check-in.</div>'}
      </div>`));
  } catch (err) {
    console.error('[admin detail] Error:', err.message);
    res.status(500).send(page('Error', '<div class="wrap"><h1>Something went wrong</h1></div>'));
  }
});

// ---- CSV export ----

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

router.get('/admin/export.csv', requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id, 10) || null;
    const type = ['weekly', 'eom_report'].includes(req.query.type) ? req.query.type : null;
    const rows = await queryCheckins({ clientId, type, limit: 100000 });

    // One column per question. Filtered exports use that form's questions;
    // unfiltered exports include both forms' columns.
    const questionCols = type
      ? DEFS[type].QUESTIONS
      : [...weeklyDef.QUESTIONS, ...eomDef.QUESTIONS];

    const header = ['Submitted (Dublin time)', 'Client', 'Type', 'Cycle starting', 'Score / 45', 'Band']
      .concat(questionCols.map((q) => q.question));

    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      const answers = answersFromFormData(r.form_data);
      const score = DEFS[r.type] ? computeScore(DEFS[r.type], answers) : { total: null, band: null };
      const rowQuestions = DEFS[r.type] ? DEFS[r.type].QUESTIONS : [];
      const rowIds = new Set(rowQuestions.map((q) => q.id));
      const line = [
        dublin(r.submitted_at),
        r.client_name,
        r.type,
        isoDate(r.cycle_start),
        score.total != null ? score.total : '',
        score.band || '',
      ].concat(questionCols.map((q, i) => {
        // Same id can exist on both forms - only fill the column belonging
        // to this row's form (weekly columns come first in the header)
        const isWeeklyCol = i < weeklyDef.QUESTIONS.length;
        if (!type && ((r.type === 'weekly') !== isWeeklyCol)) return '';
        return rowIds.has(q.id) && answers[q.id] != null ? answers[q.id] : '';
      }));
      lines.push(line.map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="myfitcoach-checkins.csv"');
    res.send('﻿' + lines.join('\n'));
  } catch (err) {
    console.error('[admin export] Error:', err.message);
    res.status(500).send('Export failed');
  }
});

// ---- Onboarding submissions ----

router.get('/admin/onboarding', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, submitted_at, answers, status, sync_error, trainerize_user_id
       FROM onboarding_submissions
       WHERE coach_id = $1
       ORDER BY submitted_at DESC
       LIMIT 200`,
      [COACH_ID]
    );

    const tableRows = result.rows.map((r) => {
      const a = r.answers || {};
      const name = `${a.first_name || ''} ${a.surname || ''}`.trim() || '(no name)';
      const statusPill = r.status === 'synced'
        ? '<span class="pill pill--synced">Synced</span>'
        : '<span class="pill pill--failed">Sync failed</span>';
      return `<tr class="row" onclick="window.location='/admin/onboarding/${r.id}'">
        <td>${dublin(r.submitted_at)}</td>
        <td>${esc(name)}</td>
        <td>${esc(a.email || '')}</td>
        <td>${esc(a.main_goal || '').slice(0, 60)}${(a.main_goal || '').length > 60 ? '...' : ''}</td>
        <td>${statusPill}</td>
      </tr>`;
    }).join('');

    res.send(page('Onboarding', `
      ${topbar('onboarding')}
      <div class="wrap">
        <h1>Onboarding submissions</h1>
        <div class="sub">New client sign-ups from forms.myfitcoach.ie/join. Synced = created in Trainerize and added to the portal. Times in Europe/Dublin (Dublin time).</div>
        ${result.rows.length === 0
          ? '<div class="empty">No onboarding submissions yet. Share forms.myfitcoach.ie/join with a new client to get started.</div>'
          : `<table>
              <tr><th>Submitted (Dublin time)</th><th>Name</th><th>Email</th><th>Goal</th><th>Status</th></tr>
              ${tableRows}
            </table>`}
      </div>`));
  } catch (err) {
    console.error('[admin onboarding list] Error:', err.message);
    res.status(500).send(page('Error', '<div class="wrap"><h1>Something went wrong</h1></div>'));
  }
});

router.get('/admin/onboarding/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM onboarding_submissions WHERE id = $1 AND coach_id = $2`,
      [parseInt(req.params.id, 10) || 0, COACH_ID]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).send(page('Not found', '<div class="wrap"><h1>Submission not found</h1></div>'));

    const a = row.answers || {};
    const name = `${a.first_name || ''} ${a.surname || ''}`.trim() || '(no name)';

    const blocks = [];
    for (const q of onboardingDef.QUESTIONS) {
      let v = a[q.id];
      if (q.kind === 'multichoice' && Array.isArray(v)) {
        const parts = v.slice();
        if (parts.indexOf('Other') !== -1 && a[q.id + '_other']) {
          parts[parts.indexOf('Other')] = 'Other: ' + a[q.id + '_other'];
        }
        v = parts.join(', ');
      }
      if (v == null || v === '') continue;
      blocks.push(`<div class="qa"><div class="q">${q.number ? q.number + '. ' : ''}${esc(q.question)}</div><div class="a">${esc(v)}</div></div>`);
    }

    const statusBlock = row.status === 'synced'
      ? `<div class="meta-grid">
           <div class="item"><div class="k">Status</div><div class="v">Synced</div></div>
           <div class="item"><div class="k">Trainerize user</div><div class="v">${esc(row.trainerize_user_id || '')}</div></div>
           ${row.sync_error ? `<div class="item"><div class="k">Note</div><div class="v">${esc(row.sync_error)}</div></div>` : ''}
         </div>`
      : `<div class="sync-error">Trainerize sync failed: ${esc(row.sync_error || 'unknown error')}. The answers are safe - fix the cause and retry.</div>
         <form method="POST" action="/admin/onboarding/${row.id}/retry" style="margin-bottom:24px">
           <button class="btn" type="submit">Retry Trainerize sync</button>
         </form>`;

    res.send(page(`${name} onboarding`, `
      ${topbar('onboarding')}
      <div class="wrap">
        <a class="backlink" href="/admin/onboarding">&larr; All onboarding</a>
        <h1>${esc(name)}</h1>
        <div class="sub">Submitted ${dublin(row.submitted_at)} (Dublin time)</div>
        ${statusBlock}
        ${blocks.join('')}
      </div>`));
  } catch (err) {
    console.error('[admin onboarding detail] Error:', err.message);
    res.status(500).send(page('Error', '<div class="wrap"><h1>Something went wrong</h1></div>'));
  }
});

router.post('/admin/onboarding/:id/retry', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM onboarding_submissions WHERE id = $1 AND coach_id = $2 AND status = 'sync_failed'`,
      [parseInt(req.params.id, 10) || 0, COACH_ID]
    );
    const row = result.rows[0];
    if (!row) return res.redirect('/admin/onboarding');

    const sync = await syncSubmission(row.answers);
    await pool.query(
      `UPDATE onboarding_submissions
       SET status = $1, trainerize_user_id = $2, client_id = $3, sync_error = $4
       WHERE id = $5`,
      [sync.status, sync.trainerize_user_id, sync.client_id, sync.sync_error, row.id]
    );
    return res.redirect(`/admin/onboarding/${row.id}`);
  } catch (err) {
    console.error('[admin onboarding retry] Error:', err.message);
    return res.redirect('/admin/onboarding');
  }
});

module.exports = router;
