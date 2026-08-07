require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { trainerizePostRaw } = require('../lib/trainerize');

const USER_ID = 26318192;
const DATES = [
  '2026-02-19','2026-02-20','2026-03-02','2026-03-06','2026-03-09',
  '2026-03-10','2026-03-11','2026-03-12','2026-03-17','2026-03-18',
  '2026-03-19','2026-03-20','2026-03-29','2026-03-31','2026-04-02',
  '2026-04-07','2026-04-08','2026-04-09','2026-04-10',
];

(async () => {
  for (const date of DATES) {
    try {
      const res = await trainerizePostRaw('/bodystats/get', {
        userID: USER_ID, date, unitBodystats: 'cm', unitWeight: 'kg',
      });
      console.log(`${date}: ${res?.bodyMeasures?.bodyWeight}kg`);
    } catch (err) {
      console.error(`${date} FAIL:`, err.message);
    }
  }
})();
