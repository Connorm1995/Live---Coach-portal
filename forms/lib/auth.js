/**
 * Single-user admin auth for MyFitCoach Forms.
 *
 * Login compares against FORMS_ADMIN_PASSWORD (.env). A successful login sets an
 * httpOnly cookie holding a SIGNED, EXPIRING session token.
 *
 * ---------------------------------------------------------------------------
 * Why this was rewritten (Aug 2026)
 * ---------------------------------------------------------------------------
 * The previous cookie value was HMAC(secret, 'mfc-forms-admin-v1') - a constant.
 * Every login produced the identical value, forever. That meant:
 *
 *   - the token never expired server-side. Max-Age is only a hint the browser
 *     is free to ignore, and an attacker holding the value ignores it entirely;
 *   - "Log out" cleared the cookie in that one browser and locked nobody out;
 *   - a single leak (an old laptop, a sold phone, browser sync into a
 *     compromised account) was permanent, unrevokable access to every client's
 *     health data, with no action available in the app to close it.
 *
 * Tokens are now `v2.<issuedAt>.<epoch>.<hmac>`:
 *   issuedAt  ms timestamp, checked against MAX_AGE_DAYS on every request, so
 *             expiry is enforced by us and not by the browser's good manners.
 *   epoch     the current value in auth_epochs. Bumping it invalidates every
 *             token ever issued - this is the "log out everywhere" kill switch.
 *   hmac      over the other three parts, so none of them can be edited.
 *
 * Old v1 constant tokens no longer parse, so they are dead on deploy. The one
 * visible effect is having to log in once more after the upgrade.
 *
 * This file is deliberately duplicated in backend/lib/auth.js rather than
 * shared, because MyFitCoach Forms has no code dependency on the Coach Portal.
 * If the token format changes, change both.
 */

const crypto = require('crypto');
const pool = require('../db/pool');

const COOKIE_NAME = 'mfc_forms_admin';
const APP = 'forms';
const COACH_ID = 1;

// Expiry is measured from last use, not from login: the cookie is reissued on
// every authenticated page load, so regular use never logs you out, while a
// device left untouched this long falls out on its own.
const MAX_AGE_DAYS = 30;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// Tolerance for a token that looks very slightly future-dated (clock skew).
const FUTURE_SKEW_MS = 5 * 60 * 1000;

const EPOCH_REFRESH_MS = 15 * 1000;

// null means "never successfully loaded". Auth FAILS CLOSED in that state:
// admin pages cannot render without the database anyway, so refusing to
// authenticate costs nothing real and avoids honouring a revoked token if the
// database is unreachable.
let cachedEpoch = null;
let epochLoadedAt = 0;

function secret() {
  const s = process.env.FORMS_SESSION_SECRET;
  if (!s) throw new Error('FORMS_SESSION_SECRET is not set');
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
  epochLoadedAt = Date.now();
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

/**
 * Invalidate every session on every device, everywhere, immediately.
 * The local cache is updated in the same breath so this instance never
 * accepts an old token even for the moment before the next refresh.
 */
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
  epochLoadedAt = Date.now();
  return cachedEpoch;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

function makeToken(epoch) {
  const payload = `v2.${Date.now()}.${epoch}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Constant-time password comparison.
 *
 * Both sides are hashed first so the compared length is always identical - a
 * raw timingSafeEqual on the plaintext needs an early length check, which
 * leaks how long the real password is.
 */
function passwordMatches(supplied) {
  const expected = process.env.FORMS_ADMIN_PASSWORD;
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

/** Verify a token. Returns true only if signature, age and epoch all hold. */
function tokenIsValid(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [version, issuedAtRaw, epochRaw, mac] = parts;
  if (version !== 'v2') return false;

  const payload = `${version}.${issuedAtRaw}.${epochRaw}`;
  let expectedMac;
  try {
    expectedMac = sign(payload);
  } catch {
    return false;
  }
  // Signature first: nothing else in the token can be trusted until it holds.
  if (mac.length !== expectedMac.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) return false;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  if (age > MAX_AGE_MS) return false;
  if (age < -FUTURE_SKEW_MS) return false;

  if (cachedEpoch === null) return false; // fail closed, see cachedEpoch above
  if (Number(epochRaw) !== cachedEpoch) return false;

  return true;
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
 * This used to read `NODE_ENV === 'production'`, and that silently broke: the
 * variable stopped being set on the deployed service and the Secure flag
 * quietly disappeared from the session cookie, meaning it could be sent over
 * plain http. A security control must not depend on an environment variable
 * that can go missing without anything failing.
 *
 * Railway terminates TLS at its edge and forwards the original scheme, so the
 * request itself is the honest answer. `trust proxy` is set in server.js, which
 * is what makes req.secure meaningful behind that proxy.
 */
function isHttps(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers && req.headers['x-forwarded-proto'];
  return typeof proto === 'string' && proto.split(',')[0].trim() === 'https';
}

function cookieAttributes(req) {
  const secure = isHttps(req) ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}${secure}`;
}

function setSessionCookie(req, res) {
  if (cachedEpoch === null) throw new Error('session epoch not loaded');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${makeToken(cachedEpoch)}; ${cookieAttributes(req)}`);
}

function clearSessionCookie(req, res) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0${secure}`);
}

/**
 * Express middleware. Also slides the expiry forward: every authenticated page
 * load reissues the cookie, so "30 days" means 30 days idle, not 30 days total.
 */
function requireAdmin(req, res, next) {
  if (!isAuthed(req)) return res.redirect('/admin/login');
  try { setSessionCookie(req, res); } catch { /* never block a page on a reissue */ }
  return next();
}

module.exports = {
  requireAdmin, isAuthed, passwordMatches,
  setSessionCookie, clearSessionCookie,
  initAuth, revokeAllSessions,
  MAX_AGE_DAYS, isHttps,
  _test: { tokenIsValid, makeToken, loadEpoch, getCachedEpoch: () => cachedEpoch },
};
