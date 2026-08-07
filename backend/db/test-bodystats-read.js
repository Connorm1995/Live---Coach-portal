require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { trainerizePostRaw } = require('../lib/trainerize');

const USER_ID = 5346208;
const DATES = ['2026-03-10', '2026-04-10', '2026-04-11', '2026-04-13'];

(async () => {
  for (const date of DATES) {
    try {
      const res = await trainerizePostRaw('/bodystats/get', {
        userID: USER_ID,
        date,
        unitBodystats: 'cm',
        unitWeight: 'kg',
      });
      console.log(`${date}:`, JSON.stringify(res?.bodyMeasures ?? res));
    } catch (err) {
      console.error(`${date} FAIL:`, err.message);
    }
  }
})();
