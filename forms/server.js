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

const app = express();
const PORT = process.env.FORMS_PORT || 3002;

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'myfitcoach-forms' }));

app.use(checkinRoutes);
app.use(onboardingRoutes);
app.use(adminRoutes);

app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`MyFitCoach Forms listening on port ${PORT}`);
});
