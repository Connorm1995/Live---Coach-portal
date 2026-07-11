/**
 * Single-user admin auth for the forms service.
 *
 * Login compares against FORMS_ADMIN_PASSWORD (.env). A successful login sets
 * an httpOnly cookie whose value is an HMAC of FORMS_SESSION_SECRET - stateless,
 * survives restarts, and is invalidated by rotating the secret.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'mfc_forms_admin';

function sessionValue() {
  const secret = process.env.FORMS_SESSION_SECRET;
  if (!secret) throw new Error('FORMS_SESSION_SECRET is not set');
  return crypto.createHmac('sha256', secret).update('mfc-forms-admin-v1').digest('hex');
}

function passwordMatches(supplied) {
  const expected = process.env.FORMS_ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
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
    return parseCookies(req)[COOKIE_NAME] === sessionValue();
  } catch {
    return false;
  }
}

function setSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionValue()}; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${60 * 60 * 24 * 30}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0`);
}

/** Express middleware - redirects to the login page when not authenticated. */
function requireAdmin(req, res, next) {
  if (isAuthed(req)) return next();
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin, isAuthed, passwordMatches, setSessionCookie, clearSessionCookie };
