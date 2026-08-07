/**
 * Cycle date utilities.
 *
 * Weekly cycle:
 *   - Starts Sunday at 12:00 GMT (clients receive check-in link)
 *   - Response window: Sunday → Wednesday
 *   - Thursday 00:00 is the hard cutoff — anything submitted Thu–Sat is "late"
 *     and belongs to the next cycle
 *
 * EOM cycle:
 *   - Anchored to the 1st of the current month (unchanged)
 */

// Safe to require here: auto-message-templates is plain data and requires
// nothing itself, so this cannot create a circular import.
const { EOM_EXCEPTIONS } = require('./auto-message-templates');

// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const CUTOFF_DAY = 4; // Thursday

/**
 * Get the most recent Sunday as YYYY-MM-DD.
 * If today is Sunday, returns today.
 */
function getCurrentCycleSunday() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, works in UTC
  const sunday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - day
  ));
  return sunday.toISOString().split('T')[0];
}

/**
 * Get the 1st of the current month as YYYY-MM-DD.
 */
function getCurrentMonthFirst() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Is the current weekly cycle closed?
 * Returns true if today is Thursday (4), Friday (5), or Saturday (6).
 */
function isCycleClosed() {
  const day = new Date().getUTCDay();
  return day >= CUTOFF_DAY; // Thu=4, Fri=5, Sat=6
}

/**
 * Get the EOM deadline Monday for a given year/month.
 *
 * The EOM report opens on the last Saturday of the month.
 * The deadline is the following Monday (which may fall in the next month).
 *
 * A month listed in EOM_EXCEPTIONS does not use the last Saturday - its prompt
 * was deliberately moved (e.g. December 2026, a week early for Christmas). The
 * deadline Monday moves with it, staying two days after whatever Saturday that
 * month's prompt actually goes out on. It is derived rather than configured
 * separately so the two can never drift apart.
 *
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - 1-based month (1=Jan, 12=Dec)
 * @returns {{ year: number, month: number, day: number }} The deadline Monday
 */
function getEomDeadlineMonday(year, month) {
  const exception = EOM_EXCEPTIONS[`${year}-${String(month).padStart(2, '0')}`];
  if (exception) {
    const moved = new Date(`${exception.date}T00:00:00Z`);
    moved.setUTCDate(moved.getUTCDate() + 2);
    return {
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
    };
  }

  // Last day of the given month (day 0 of the next month = last day of this month)
  const lastDay = new Date(Date.UTC(year, month, 0));
  const dow = lastDay.getUTCDay(); // 0=Sun..6=Sat

  // Walk back to the last Saturday (day 6)
  // If lastDay is Sat (6), offset is 0. If Sun (0), offset is 1. If Mon (1), offset is 2. etc.
  const offset = (dow + 1) % 7; // Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=0
  const lastSat = new Date(lastDay);
  lastSat.setUTCDate(lastDay.getUTCDate() - offset);

  // Deadline Monday = last Saturday + 2 days
  const monday = new Date(lastSat);
  monday.setUTCDate(lastSat.getUTCDate() + 2);

  return {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  };
}

module.exports = {
  getCurrentCycleSunday,
  getCurrentMonthFirst,
  isCycleClosed,
  getEomDeadlineMonday,
  CUTOFF_DAY,
};
