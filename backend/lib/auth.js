/**
 * Single-user auth for the coach portal.
 *
 * The portal shipped with no authentication at all: dashboard.myfitcoach.ie
 * served every client's name, email, phone number, body stats and check-in
 * answers to anyone who knew the address. This closes that.
 *
 * Mirrors the pattern already proven in forms/lib/auth.js: login compares
 * against PORTAL_ADMIN_PASSWORD, and success sets an httpOnly cookie whose
 * value is an HMAC of PORTAL_SESSION_SECRET. Stateless, survives restarts, and
 * every session is invalidated by rotating the secret.
 *
 * Both values live in .env and are never committed.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'mfc_portal';
// Sliding window: the cookie is reissued on each page load, so the clock runs
// from last use rather than from login. Someone using the portal regularly is
// never asked again; a device left untouched for a month falls out.
const MAX_AGE_DAYS = 30;

function sessionValue() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) throw new Error('PORTAL_SESSION_SECRET is not set');
  return crypto.createHmac('sha256', secret).update('mfc-portal-v1').digest('hex');
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
    const supplied = parseCookies(req)[COOKIE_NAME];
    if (!supplied) return false;
    const expected = sessionValue();
    if (supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch {
    return false;
  }
}

function setSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionValue()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * MAX_AGE_DAYS}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
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
};
