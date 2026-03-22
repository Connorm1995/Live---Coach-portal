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
const { startScheduler } = require('./lib/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'https://dashboard.myfitcoach.ie',
];
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json());

app.use('/api/checkins', checkinRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
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
