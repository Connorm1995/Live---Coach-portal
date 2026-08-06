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

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
// Everything below this point requires a session except /health, /webhooks and
// the login routes themselves. This gate is deliberately mounted before every
// route so a new endpoint is private by default rather than public by default.

app.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect('/');
  res.status(req.query.failed === '1' ? 401 : 200)
    .type('html')
    .send(auth.LOGIN_PAGE(req.query.failed === '1'));
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (auth.passwordMatches((req.body || {}).password || '')) {
    auth.setSessionCookie(res);
    return res.redirect('/');
  }
  // Blanket delay on failure - makes guessing slow without needing rate limiting.
  return setTimeout(() => res.redirect('/login?failed=1'), 1000);
});

app.get('/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.redirect('/login');
});

app.use((req, res, next) => {
  if (auth.isPublicPath(req.path)) return next();
  if (auth.isAuthed(req)) {
    // Slide the expiry forward on page loads so regular use never expires.
    // Skipped for /api/ calls purely to avoid stamping a Set-Cookie header on
    // every one of the dozen requests a single dashboard view fires off.
    if (!req.path.startsWith('/api/')) auth.setSessionCookie(res);
    return next();
  }
  // API callers get a status they can act on; browsers get the login page.
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }
  return res.redirect('/login');
});

// Keep the whole portal out of search engines and automated crawlers.
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex');
  next();
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
