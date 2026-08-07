/**
 * One-off: write body stats for a given Trainerize userID.
 *
 * Posts one entry per (date, weightKg) pair to /bodystats/set.
 * Run: node backend/db/test-bodystats-write.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { trainerizePostRaw } = require('../lib/trainerize');

const USER_ID = 5346208;

const ENTRIES = [
  { date: '2026-03-10', weight: 92 },
  { date: '2026-04-10', weight: 91.1 },
  { date: '2026-04-11', weight: 90.3 },
  { date: '2026-04-13', weight: 90.1 },
];

(async () => {
  for (const { date, weight } of ENTRIES) {
    const body = {
      userid: USER_ID,
      date,
      unitWeight: 'kg',
      unitBodystats: 'cm',
      bodyMeasures: { bodyWeight: weight },
    };
    try {
      const res = await trainerizePostRaw('/bodystats/set', body);
      console.log(`[OK]   ${date}  ${weight}kg  ->`, JSON.stringify(res));
    } catch (err) {
      console.error(`[FAIL] ${date}  ${weight}kg  ->`, err.message);
    }
  }
})();
