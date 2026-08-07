require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const express = require('express');
const cors = require('cors');
const checkinRoutes = require('./routes/checkins');
const clientRoutes = require('./routes/clients');
const overviewRoutes = require('./routes/overview');
const webhookRoutes = require('./routes/webhooks');
const trainingRoutes = require('./routes/training');
const nutritionRoutes = require('./routes/nutrition');
const calendarRoutes = require('./routes/calendar');
const messageRoutes = require('./routes/messages');
const settingsRoutes = require('./routes/settings');
const clientOverviewRoutes = require('./routes/client-overview');
const { startScheduler } = require('./lib/scheduler');
const auth = require('./lib/auth');

const app = express();
// Railway terminates TLS at its edge, so req.secure and req.ip must come from
// the forwarded headers rather than the direct socket.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Refuse to start without the auth configuration.
//
// This is deliberately fatal rather than a warning. If these are missing the
// portal would demand a password it cannot check, locking the coach out of
// their own dashboard with no way back in. Exiting instead means the platform's
// healthcheck fails, the deploy is rejected, and the previous version keeps
// serving - a failed deploy is a far better outcome than a lockout.
//
// It must never fall back to "no auth" when unconfigured: that would turn a
// missing variable into a silently public dashboard full of client data.
for (const key of ['PORTAL_ADMIN_PASSWORD', 'PORTAL_SESSION_SECRET']) {
  if (!process.env[key]) {
    console.error(
      `\nFATAL: ${key} is not set.\n\n` +
      `The coach portal will not start without it, because starting would either\n` +
      `lock you out of the dashboard or leave client data public.\n\n` +
      `Set it in Railway (portal service -> Variables) and in your local .env.\n`
    );
    process.exit(1);
  }
}

const allowedOrigins = [
  'http://localhost:3000',
  'https://dashboard.myfitcoach.ie',
];
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  // The session lives in a cookie, so the browser must be allowed to send it
  // on cross-origin API calls during local development (localhost:3000 -> :3001).
  credentials: true,
}));
app.use(express.json());

/**
 * Security headers.
 *
 *  HSTS   forces https for a year. Without it, typing the bare address once
 *         over http leaves that first request interceptable.
 *  frame  the dashboard holds every client's personal and health data - never
 *         allow another site to frame it (clickjacking).
 *  nosniff  stop the browser second-guessing content types.
 *  referrer  do not leak dashboard URLs to third parties.
 *
 * Mounted here, above every route, so it also covers /robots.txt and the
 * login page. Sitting lower down it missed both, and a login page that can
 * be framed by another site is exactly what clickjacking needs.
 *
 * No Content-Security-Policy yet: the React build and its inline bootstrap
 * would need a policy written against the real bundle rather than guessed at.
 */
app.use((req, res, next) => {
  // Sent only on real https requests - browsers ignore HSTS over plain http,
  // and this must not depend on NODE_ENV, which went missing on the deployed
  // service and silently took the cookie's Secure flag with it.
  if (auth.isHttps(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// The delay grows with consecutive failures and is capped, so a burst of
// guessing becomes slow while a genuine typo costs a second. Failures are also
// logged: previously nothing recorded that anyone had tried.
const LOGIN_FAIL_DELAY_MS = 1000;
const LOGIN_FAIL_DELAY_MAX_MS = 15000;
let consecutiveLoginFailures = 0;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
// Everything below this point requires a session except /health, /webhooks and
// the login routes themselves. This gate is deliberately mounted before every
// route so a new endpoint is private by default rather than public by default.

// Crawler directives must sit ABOVE the auth gate.
//
// Both of these were originally mounted below it, which defeated them: the gate
// redirected /robots.txt to the login page, so a crawler asking permission got
// HTML instead of an answer, and the header never reached the redirect response
// at all. A robots.txt a crawler cannot read is not a robots.txt.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    '# The coach portal holds client personal data and is password protected.\n' +
    '# Nothing here should be crawled, indexed, or archived by anyone.\n' +
    'User-agent: *\nDisallow: /\n'
  );
});

app.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect('/');
  res.status(req.query.failed === '1' ? 401 : 200)
    .type('html')
    .send(auth.LOGIN_PAGE(req.query.failed === '1'));
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (auth.passwordMatches((req.body || {}).password || '')) {
    if (consecutiveLoginFailures > 0) {
      console.warn(`[auth] successful login after ${consecutiveLoginFailures} failed attempt(s)`);
    }
    consecutiveLoginFailures = 0;
    auth.setSessionCookie(req, res);
    return res.redirect('/');
  }
  consecutiveLoginFailures++;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  console.warn(`[auth] FAILED login attempt #${consecutiveLoginFailures} from ${ip}`);
  const delay = Math.min(LOGIN_FAIL_DELAY_MS * consecutiveLoginFailures, LOGIN_FAIL_DELAY_MAX_MS);
  return setTimeout(() => res.redirect('/login?failed=1'), delay);
});

app.get('/logout', (req, res) => {
  auth.clearSessionCookie(req, res);
  res.redirect('/login');
});

/**
 * Log out every device, everywhere, immediately - including anyone holding a
 * stolen session cookie. Bumps the epoch every issued token is signed against.
 */
app.post('/logout-everywhere', async (req, res) => {
  if (!auth.isAuthed(req)) return res.redirect('/login');
  try {
    const epoch = await auth.revokeAllSessions();
    console.warn(`[auth] ALL PORTAL SESSIONS REVOKED - session epoch is now ${epoch}`);
    auth.clearSessionCookie(req, res);
    return res.redirect('/login?revoked=1');
  } catch (err) {
    console.error('[auth] revoke failed:', err.message);
    return res.status(500).send('Could not log out other devices. Try again.');
  }
});

app.use((req, res, next) => {
  if (auth.isPublicPath(req.path)) return next();
  if (auth.isAuthed(req)) {
    // Slide the expiry forward on page loads so regular use never expires.
    // Skipped for /api/ calls purely to avoid stamping a Set-Cookie header on
    // every one of the dozen requests a single dashboard view fires off.
    if (!req.path.startsWith('/api/')) auth.setSessionCookie(req, res);
    return next();
  }
  // API callers get a status they can act on; browsers get the login page.
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }
  return res.redirect('/login');
});

app.use('/api/checkins', checkinRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/client-overview', clientOverviewRoutes);
app.use('/webhooks', webhookRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve React frontend build in production
const buildPath = path.resolve(__dirname, '../frontend/build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Sessions cannot be validated until the revocation epoch is loaded, and auth
// fails closed until it is. Load it before accepting traffic so the first
// request after a deploy is never wrongly rejected. Fatal on failure for the
// same reason the credential check above is: a failed deploy beats a lockout.
auth.initAuth()
  .then((epoch) => {
    console.log(`[auth] session epoch ${epoch} loaded`);
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startScheduler();
    });
  })
  .catch((err) => {
    console.error('\nFATAL: could not load the session epoch:', err.message);
    console.error('Refusing to start - auth would reject every login.\n');
    process.exit(1);
  });
