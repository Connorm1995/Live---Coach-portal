/**
 * Public, client-facing pages.
 *
 * Everything in here is served WITHOUT a portal login, and that is the point:
 * these pages are for clients, who have no portal account and never will. The
 * paths are listed in lib/auth.js isPublicPath alongside /webhooks/.
 *
 * The original Oura attempt in .env pointed its redirect at
 * /api/connect/oura/callback, which sits behind the login gate. A client
 * approving on Oura would have been bounced straight to the coach's admin
 * password prompt with no way forward. Hence the separate public prefix.
 *
 * Nothing here trusts the caller. The only way to reach a client record is a
 * link token that was minted in the portal, has not expired, and has not
 * already been used.
 */

const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const whoop = require('../lib/whoop');
const whoopStore = require('../lib/whoop-store');

const router = express.Router();

const COACH_ID = 1;
const LINK_TTL_DAYS = 14;

// No 0/O/1/l/I: these get read aloud and typed off phones. Same alphabet as
// MyFitCoach Forms uses for its check-in links.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function mintToken(length = 16) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function page({ nonce, title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} - MyFitCoach</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap">
<style nonce="${nonce}">
  :root {
    --ink: #16202A;
    --ink-soft: #56646F;
    --ground: #F2F4F6;
    --surface: #FFFFFF;
    --rule: #DFE5E9;
    --accent: #0F6E8C;
    --good: #16855F;
    --bad: #A8382A;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.6;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    max-width: 460px;
    width: 100%;
    padding: 36px 32px;
    box-shadow: 0 1px 2px rgba(22,32,42,.05), 0 12px 32px -16px rgba(22,32,42,.25);
  }
  .brand {
    font-size: 12px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
    margin: 0 0 18px;
  }
  h1 { font-size: 26px; line-height: 1.2; margin: 0 0 14px; letter-spacing: -.02em; }
  p { margin: 0 0 14px; color: var(--ink-soft); font-size: 15.5px; }
  p.tight { margin-bottom: 8px; }
  ul { margin: 0 0 20px; padding-left: 20px; color: var(--ink-soft); font-size: 15px; }
  li { margin-bottom: 6px; }
  .btn {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    text-decoration: none;
    font-weight: 700;
    font-size: 16px;
    padding: 14px 26px;
    border-radius: 7px;
    margin-top: 6px;
  }
  .btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .ok  { color: var(--good); font-weight: 700; }
  .err { color: var(--bad); font-weight: 700; }
  .fine { font-size: 13px; color: #7D8D99; margin-top: 22px; margin-bottom: 0; }
  .fine a { color: #7D8D99; }
  h2 { font-size: 17px; margin: 26px 0 8px; }
  .doc { max-width: 660px; }
  .doc h1 { font-size: 28px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GET /connect/whoop/callback - Whoop sends the client back here
// ---------------------------------------------------------------------------
// Declared BEFORE the :token route, or "callback" would be read as a token.

router.get('/connect/whoop/callback', async (req, res) => {
  const nonce = res.locals.cspNonce;
  const { code, state, error } = req.query;

  const fail = (heading, detail) => res.status(400).type('html').send(page({
    nonce,
    title: 'Could not connect',
    body: `<div class="card">
      <p class="brand">MyFitCoach</p>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(detail)}</p>
      <p class="fine">Nothing has been changed. Message your coach and he will send you a fresh link.</p>
    </div>`,
  }));

  // The client pressed Deny, which is a legitimate choice rather than a fault.
  if (error) {
    return res.status(200).type('html').send(page({
      nonce,
      title: 'Not connected',
      body: `<div class="card">
        <p class="brand">MyFitCoach</p>
        <h1>No problem</h1>
        <p>Your Whoop has <strong>not</strong> been connected and nothing has been shared.</p>
        <p class="fine">If you change your mind, the link your coach sent you still works.</p>
      </div>`,
    }));
  }

  if (!code || !state) return fail('Something went missing', 'Whoop did not send back everything needed to finish. Please try the link again.');

  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.client_id, l.used_at, l.expires_at, c.name
       FROM whoop_connect_links l
       JOIN clients c ON c.id = l.client_id
       WHERE l.token = $1 AND l.coach_id = $2`,
      [String(state), COACH_ID]
    );
    const link = rows[0];

    if (!link) return fail('This link is not valid', 'It may have been mistyped or already replaced.');
    if (link.used_at) return fail('This link has already been used', 'Your Whoop may already be connected.');
    if (new Date(link.expires_at) < new Date()) return fail('This link has expired', 'Links are only good for a couple of weeks for your security.');

    const tokens = await whoop.exchangeCode(code);

    // Record which Whoop account this is, so a client reconnecting a different
    // strap is visible rather than silently overwriting.
    // Uses the freshly issued token directly: there is no stored connection to
    // renew from yet. The profile is a nicety, so a failure here never costs
    // the client their connection.
    let whoopUserId = null;
    try {
      const profileRes = await fetch(
        'https://api.prod.whoop.com/developer/v2/user/profile/basic',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (profileRes.ok) whoopUserId = (await profileRes.json())?.user_id ?? null;
    } catch (err) {
      console.warn('[Whoop] could not read profile on connect:', err.message);
    }

    await whoop.saveConnection(link.client_id, tokens, whoopUserId);

    await pool.query(
      `UPDATE whoop_connect_links SET used_at = now() WHERE id = $1`,
      [link.id]
    );

    // Switch the client over now that there is somewhere for the data to come
    // from. Steps are untouched and keep arriving from Trainerize.
    await pool.query(
      `UPDATE clients SET health_source = 'whoop' WHERE id = $1 AND coach_id = $2`,
      [link.client_id, COACH_ID]
    );
    whoopStore.forgetSource(link.client_id);

    // The backfill takes several seconds. Run it behind the response so the
    // client sees "done" straight away rather than staring at a spinner.
    whoopStore.backfill(link.client_id)
      .then(r => console.log(`[Whoop] backfill for client ${link.client_id}:`, r))
      .catch(err => console.error(`[Whoop] backfill failed for client ${link.client_id}:`, err.message));

    return res.type('html').send(page({
      nonce,
      title: 'Connected',
      body: `<div class="card">
        <p class="brand">MyFitCoach</p>
        <h1>You're connected <span class="ok">&#10003;</span></h1>
        <p>Your Whoop is now linked. Your coach will see your recovery, sleep and strain alongside the rest of your training.</p>
        <p>Nothing else to do. You can close this page.</p>
        <p class="fine">You can disconnect at any time from your Whoop app, under Settings, and your coach can remove the data on request.</p>
      </div>`,
    }));
  } catch (err) {
    console.error('[Whoop] callback failed:', err.message);
    return fail('Could not finish connecting', 'Something went wrong on our side. Your coach has been notified.');
  }
});

// ---------------------------------------------------------------------------
// GET /connect/whoop/:token - the page the client lands on
// ---------------------------------------------------------------------------

router.get('/connect/whoop/:token', async (req, res) => {
  const nonce = res.locals.cspNonce;
  const token = String(req.params.token || '');

  const dead = (heading, detail) => res.status(404).type('html').send(page({
    nonce,
    title: 'Link not valid',
    body: `<div class="card">
      <p class="brand">MyFitCoach</p>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(detail)}</p>
      <p class="fine">Message your coach and he will send you a new one.</p>
    </div>`,
  }));

  try {
    if (!whoop.isConfigured()) {
      console.error('[Whoop] connect page hit before WHOOP_CLIENT_ID/SECRET/REDIRECT_URI were set');
      return dead('Not quite ready', 'This link is not active yet. Your coach is still setting things up.');
    }

    const { rows } = await pool.query(
      `SELECT l.used_at, l.expires_at, c.name
       FROM whoop_connect_links l
       JOIN clients c ON c.id = l.client_id
       WHERE l.token = $1 AND l.coach_id = $2`,
      [token, COACH_ID]
    );
    const link = rows[0];

    if (!link) return dead('This link is not valid', 'It may have been mistyped, or replaced by a newer one.');
    if (link.used_at) return dead('This link has already been used', 'Your Whoop is most likely already connected.');
    if (new Date(link.expires_at) < new Date()) return dead('This link has expired', 'Links are only good for a couple of weeks for your security.');

    const firstName = String(link.name || '').trim().split(/\s+/)[0] || 'there';

    return res.type('html').send(page({
      nonce,
      title: 'Connect your Whoop',
      body: `<div class="card">
        <p class="brand">MyFitCoach</p>
        <h1>Hi ${escapeHtml(firstName)}, let's connect your Whoop</h1>
        <p class="tight">This lets your coach see, alongside your training:</p>
        <ul>
          <li>Your recovery score and HRV</li>
          <li>Your sleep, including how much you actually needed</li>
          <li>Your daily strain and calories</li>
        </ul>
        <p class="tight">A few things worth knowing:</p>
        <ul>
          <li>Your coach can only <strong>read</strong> this. Nothing can be changed on your Whoop account.</li>
          <li>You are not sharing your password. Whoop handles the sign-in.</li>
          <li>You can disconnect whenever you like, from your Whoop app.</li>
        </ul>
        <a class="btn" href="${escapeHtml(whoop.authorizeUrl(token))}">Connect my Whoop</a>
        <p class="fine">Takes about ten seconds. <a href="/privacy">How your data is handled</a>.</p>
      </div>`,
    }));
  } catch (err) {
    console.error('[Whoop] connect page failed:', err.message);
    return dead('Something went wrong', 'Please try again in a moment.');
  }
});

// ---------------------------------------------------------------------------
// GET /privacy
// ---------------------------------------------------------------------------
// Required by Whoop when registering the app, and genuinely needed: this
// describes health data about a named person held on a coach's systems.

router.get('/privacy', (req, res) => {
  const nonce = res.locals.cspNonce;
  res.type('html').send(page({
    nonce,
    title: 'Privacy',
    body: `<div class="card doc">
      <p class="brand">MyFitCoach</p>
      <h1>Privacy policy</h1>
      <p>This describes what MyFitCoach does with the information of clients it coaches. MyFitCoach is a personal coaching business operating from Ireland.</p>

      <h2>What is held</h2>
      <p>Your name and contact details, the answers you give in check-in and onboarding forms, and the training, nutrition and body measurement data recorded in your coaching app.</p>
      <p>If you choose to connect a wearable such as Whoop, that also includes the health and fitness data it records: sleep, recovery, heart rate variability, resting heart rate, daily strain, calories, workouts, respiratory rate, blood oxygen and skin temperature.</p>

      <h2>Why it is held</h2>
      <p>Solely to coach you: to write your programme, adjust it, and talk to you about it. Your data is never sold, never used for advertising, and never shared with anyone outside MyFitCoach except the service providers listed below, who process it only in order to run the service.</p>

      <h2>Connecting a wearable</h2>
      <p>Connecting is optional and is your choice. You authorise it on the provider's own sign-in screen, which lists exactly what is being requested. MyFitCoach never sees or holds your password for that account, and can only read data, never change anything.</p>
      <p>You can disconnect at any time from within your wearable provider's own app or account settings. You can also ask your coach to disconnect it and delete the data, which removes it from the coaching dashboard.</p>

      <h2>Who processes it</h2>
      <ul>
        <li>Railway, which runs the coaching dashboard</li>
        <li>Cloudflare R2, which stores encrypted backups</li>
        <li>Trainerize, the coaching app</li>
        <li>Your wearable provider, if you connected one</li>
      </ul>

      <h2>How long it is kept</h2>
      <p>For as long as you are a client, and for a reasonable period afterwards in case you return. Ask and it will be deleted sooner.</p>

      <h2>Your rights</h2>
      <p>Under GDPR you can ask for a copy of what is held about you, ask for it to be corrected, ask for it to be deleted, or withdraw your consent to a wearable connection. Ask your coach directly and it will be done.</p>

      <h2>Security</h2>
      <p>The coaching dashboard is password protected and access is limited to your coach. Wearable access keys are encrypted before storage. Backups are encrypted.</p>

      <h2>Contact</h2>
      <p>Contact your coach directly with any question about your data, or email connormeyler@gmail.com.</p>

      <p class="fine">Last updated 12 September 2026.</p>
    </div>`,
  }));
});

// ---------------------------------------------------------------------------
// Link minting - called by the authenticated admin API, not by clients
// ---------------------------------------------------------------------------

async function mintConnectLink(clientDbId) {
  const expires = new Date();
  expires.setDate(expires.getDate() + LINK_TTL_DAYS);

  // Replace any outstanding unused link. Two live links for one client is a
  // way to get confused about which one you sent.
  await pool.query(
    `DELETE FROM whoop_connect_links
     WHERE client_id = $1 AND coach_id = $2 AND used_at IS NULL`,
    [clientDbId, COACH_ID]
  );

  const token = mintToken();
  await pool.query(
    `INSERT INTO whoop_connect_links (coach_id, client_id, token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [COACH_ID, clientDbId, token, expires.toISOString()]
  );

  const base = (process.env.WHOOP_REDIRECT_URI || '').replace(/\/connect\/whoop\/callback$/, '')
    || 'https://dashboard.myfitcoach.ie';

  return { token, url: `${base}/connect/whoop/${token}`, expiresAt: expires.toISOString() };
}

module.exports = { router, mintConnectLink, LINK_TTL_DAYS };
