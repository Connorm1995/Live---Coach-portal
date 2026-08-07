/**
 * Delete ONLY the 4 specific bodystats entries we just wrote.
 * Targets by (userID, date) - no other dates will be touched.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { trainerizePostRaw } = require('../lib/trainerize');

const USER_ID = 5346208;
const DATES = ['2026-03-10', '2026-04-10', '2026-04-11', '2026-04-13'];

(async () => {
  for (const date of DATES) {
    try {
      const res = await trainerizePostRaw('/bodystats/delete', {
        userID: USER_ID,
        date,
      });
      console.log(`[DEL]  ${date} ->`, JSON.stringify(res));
    } catch (err) {
      console.error(`[FAIL] ${date} ->`, err.message);
    }
  }
})();
