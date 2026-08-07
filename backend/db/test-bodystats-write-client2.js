/**
 * Write historical body stats for Trainerize client 26318192.
 * 19 entries, Feb-Apr 2026, all in kg.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { trainerizePostRaw } = require('../lib/trainerize');

const USER_ID = 26318192;

const ENTRIES = [
  { date: '2026-02-19', weight: 89.7 },
  { date: '2026-02-20', weight: 89.6 },
  { date: '2026-03-02', weight: 89.3 },
  { date: '2026-03-06', weight: 89.5 },
  { date: '2026-03-09', weight: 88.7 },
  { date: '2026-03-10', weight: 89.1 },
  { date: '2026-03-11', weight: 89.4 },
  { date: '2026-03-12', weight: 89.1 },
  { date: '2026-03-17', weight: 89.4 },
  { date: '2026-03-18', weight: 89.7 },
  { date: '2026-03-19', weight: 89.0 },
  { date: '2026-03-20', weight: 89.3 },
  { date: '2026-03-29', weight: 90.7 },
  { date: '2026-03-31', weight: 89.9 },
  { date: '2026-04-02', weight: 89.8 },
  { date: '2026-04-07', weight: 91.6 },
  { date: '2026-04-08', weight: 89.9 },
  { date: '2026-04-09', weight: 90.1 },
  { date: '2026-04-10', weight: 90.2 },
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
      console.log(`[OK]   ${date}  ${weight}kg  -> code=${res?.code}`);
    } catch (err) {
      console.error(`[FAIL] ${date}  ${weight}kg  ->`, err.message);
    }
  }
})();
