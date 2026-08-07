/**
 * Single-user auth for the coach portal.
 *
 * The portal shipped with no authentication at all: dashboard.myfitcoach.ie
 * served every client's name, email, phone number, body stats and check-in
 * answers to anyone who knew the address. This closes that.
 *
 * Login compares against PORTAL_ADMIN_PASSWORD and success sets an httpOnly
 * cookie holding a SIGNED, EXPIRING session token.
 *
 * The cookie used to be HMAC(secret, 'mfc-portal-v1') - a constant. Every login
 * produced the identical value forever, so it never expired server-side,
 * "Log out" locked nobody out, and a single leak meant permanent unrevokable
 * access with no action available in the app to close it.
 *
 * Tokens are now `v2.<issuedAt>.<epoch>.<hmac>`. issuedAt is checked against
 * MAX_AGE_DAYS on every request, and epoch is the current value in auth_epochs
 * - bumping it invalidates every token ever issued, which is the "log out
 * everywhere" kill switch. Old v1 tokens no longer parse, so the one visible
 * effect of the upgrade is having to log in once more.
 *
 * Deliberately duplicated in forms/lib/auth.js rather than shared, because
 * MyFitCoach Forms has no code dependency on the Coach Portal. If the token
 * format changes, change both.
 *
 * Both values live in .env and are never committed.
 */

const crypto = require('crypto');
const pool = require('../db/pool');

const COOKIE_NAME = 'mfc_portal';
// Sliding window: the cookie is reissued on each page load, so the clock runs
// from last use rather than from login. Someone using the portal regularly is
// never asked again; a device left untouched for a month falls out.
const MAX_AGE_DAYS = 30;

const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const EPOCH_REFRESH_MS = 15 * 1000;
const APP = 'portal';
const COACH_ID = 1;

// null means "never successfully loaded". Auth FAILS CLOSED in that state: the
// portal cannot render anything without the database anyway, so refusing to
// authenticate costs nothing real and avoids honouring a revoked token while
// the database is unreachable.
let cachedEpoch = null;

function secret() {
  const s = process.env.PORTAL_SESSION_SECRET;
  if (!s) throw new Error('PORTAL_SESSION_SECRET is not set');
  return s;
}

async function loadEpoch() {
  const { rows } = await pool.query(
    `INSERT INTO auth_epochs (coach_id, app, epoch) VALUES ($1, $2, 0)
     ON CONFLICT (coach_id, app) DO UPDATE SET app = EXCLUDED.app
     RETURNING epoch`,
    [COACH_ID, APP]
  );
  cachedEpoch = rows[0].epoch;
  return cachedEpoch;
}

/** Load the epoch now and keep it fresh. Call once at startup. */
async function initAuth() {
  await loadEpoch();
  const timer = setInterval(() => {
    loadEpoch().catch((err) =>
      console.warn('[auth] could not refresh session epoch:', err.message));
  }, EPOCH_REFRESH_MS);
  if (timer.unref) timer.unref();
  return cachedEpoch;
}

/** Invalidate every session on every device immediately. */
async function revokeAllSessions() {
  const { rows } = await pool.query(
    `INSERT INTO auth_epochs (coach_id, app, epoch, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (coach_id, app)
     DO UPDATE SET epoch = auth_epochs.epoch + 1, updated_at = now()
     RETURNING epoch`,
    [COACH_ID, APP]
  );
  cachedEpoch = rows[0].epoch;
  return cachedEpoch;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

function makeToken(epoch) {
  const payload = `v2.${Date.now()}.${epoch}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a token. True only if signature, age and epoch all hold. */
function tokenIsValid(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [version, issuedAtRaw, epochRaw, mac] = parts;
  if (version !== 'v2') return false;

  let expectedMac;
  try {
    expectedMac = sign(`${version}.${issuedAtRaw}.${epochRaw}`);
  } catch {
    return false;
  }
  // Signature first: nothing else in the token is trustworthy until it holds.
  if (mac.length !== expectedMac.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) return false;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  if (age > MAX_AGE_MS) return false;
  if (age < -FUTURE_SKEW_MS) return false;

  if (cachedEpoch === null) return false; // fail closed
  if (Number(epochRaw) !== cachedEpoch) return false;

  return true;
}

/**
 * Constant-time password comparison.
 *
 * Both sides are hashed first so the comparison length is always identical -
 * a raw timingSafeEqual on the plaintext leaks the password's length via the
 * early length check.
 */
function passwordMatches(supplied) {
  const expected = process.env.PORTAL_ADMIN_PASSWORD;
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(supplied)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  try {
    return tokenIsValid(parseCookies(req)[COOKIE_NAME]);
  } catch {
    return false;
  }
}

/**
 * Is this request actually over HTTPS?
 *
 * This used to read `NODE_ENV === 'production'`, and that silently broke on the
 * deployed service: the variable stopped being set and the Secure flag quietly
 * disappeared from the session cookie. A security control must not depend on an
 * environment variable that can go missing without anything failing. Railway
 * forwards the original scheme, so the request itself is the honest answer.
 */
function isHttps(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers && req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

function setSessionCookie(req, res) {
  if (cachedEpoch === null) throw new Error('session epoch not loaded');
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${makeToken(cachedEpoch)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * MAX_AGE_DAYS}${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

/**
 * Paths that must stay reachable without a session.
 *
 *  /health    Railway's healthcheck - gating it fails every deploy
 *  /webhooks  Trainerize and Typeform post here; they cannot log in
 *  /login     the login page and its form post
 *
 * Everything else, including every /api route and the dashboard itself,
 * requires a session.
 */
function isPublicPath(pathname) {
  return pathname === '/health'
    || pathname === '/login'
    || pathname === '/logout'
    || pathname === '/robots.txt'
    || pathname.startsWith('/webhooks/');
}

const LOGIN_PAGE = (failed) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Coach Portal - My Fit Coach</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  :root { --black:#000; --teal:#23b8b8; --teal-bright:#12dacb; --slate:#555e62; --border:#e2e5e8; --red:#ef4444; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'DM Sans',sans-serif; background:#f5f6f7; color:var(--black);
         display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .card { background:#fff; border:1px solid var(--border); border-radius:14px;
          padding:32px; width:100%; max-width:380px; }
  .brand { font-weight:700; font-size:15px; letter-spacing:-0.01em; margin-bottom:24px; }
  .brand span { color:var(--teal); }
  h1 { font-size:22px; font-weight:700; letter-spacing:-0.02em; margin-bottom:20px; }
  form { display:flex; flex-direction:column; gap:12px; }
  input { font-family:inherit; font-size:15px; padding:11px 13px;
          border:1px solid var(--border); border-radius:8px; }
  input:focus { outline:none; border-color:var(--teal); }
  button { background:var(--teal); color:#fff; border:none; border-radius:8px;
           padding:12px; font-family:inherit; font-size:15px; font-weight:500; cursor:pointer; }
  button:hover { background:var(--teal-bright); }
  .error { color:var(--red); font-size:14px; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">MY<span>FIT</span>COACH</div>
    <h1>Coach Portal</h1>
    ${failed ? '<div class="error">Wrong password - try again.</div>' : ''}
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Password" autofocus required
             autocomplete="current-password" />
      <button type="submit">Log in</button>
    </form>
  </div>
</body>
</html>`;

module.exports = {
  COOKIE_NAME,
  isAuthed,
  passwordMatches,
  setSessionCookie,
  clearSessionCookie,
  isPublicPath,
  LOGIN_PAGE,
  initAuth,
  revokeAllSessions,
  MAX_AGE_DAYS, isHttps,
  _test: { tokenIsValid, makeToken, loadEpoch, getCachedEpoch: () => cachedEpoch },
};
