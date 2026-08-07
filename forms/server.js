/**
 * MyFitCoach Forms - standalone client-facing forms service.
 *
 * Lives at forms.myfitcoach.ie. Shares the Postgres database with the coach
 * portal (writes check-ins in the same shape the Typeform webhook did) but has
 * no code dependency on it - the portal can be retired without touching this.
 *
 * Routes:
 *   /checkin/<token>   client weekly check-in form
 *   /admin             coach responses area (password protected)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');

const checkinRoutes = require('./routes/checkin');
const { router: onboardingRoutes } = require('./routes/onboarding');
const adminRoutes = require('./routes/admin');
const { initAuth } = require('./lib/auth');

const app = express();
// Railway injects PORT; FORMS_PORT wins locally so it never clashes with the portal
const PORT = process.env.FORMS_PORT || process.env.PORT || 3002;

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

/**
 * Security headers.
 *
 *  HSTS   forces https for a year. Without it, typing the bare address once
 *         over http leaves that first request interceptable.
 *  frame  the admin area holds client health data - never allow it to be
 *         framed by another site (clickjacking).
 *  nosniff  stop the browser second-guessing content types.
 *  referrer  do not leak admin URLs to third parties.
 *
 * No Content-Security-Policy header yet: the forms load Google Fonts and use
 * inline styles and scripts, so a policy written blind would break them. Worth
 * doing deliberately later rather than half now.
 */
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'myfitcoach-forms' }));

app.use(checkinRoutes);
app.use(onboardingRoutes);
app.use(adminRoutes);

app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => res.status(404).send('Not found'));

// Sessions cannot be validated until the revocation epoch is loaded, and auth
// fails closed until it is. Load it before accepting traffic so the first
// request after a deploy is never wrongly rejected.
initAuth()
  .then((epoch) => {
    console.log(`[auth] session epoch ${epoch} loaded`);
    app.listen(PORT, () => {
      console.log(`MyFitCoach Forms listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[auth] FATAL: could not load session epoch:', err.message);
    console.error('Refusing to start - admin auth would reject every login.');
    process.exit(1);
  });
