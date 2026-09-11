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
 *   - Stored as the 1st of the month the report is FOR, which is not always
 *     the month it was sent in - see getCurrentEomCycle.
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

// Reports sent on days 1 to this day of a month belong to the previous month.
const EOM_LATE_UNTIL_DAY = 14;

/**
 * The month an End of Month report sent now is FOR, as YYYY-MM-01.
 *
 * The report goes out on the last Saturday of the month, with a Monday
 * deadline two days later that can land in the next month (31 Oct 2026 ->
 * Mon 2 Nov). Filing by calendar month therefore put anything sent on the
 * 1st or 2nd under the NEW month: the report showed as next month's, dropped
 * out of the Check-in Hub, and its sender was still sent the "you haven't
 * sent it" reminder for the month they had just reported on. Seven real
 * reports were misfiled this way between April and September 2026.
 *
 * Rule: sent on the 1st to the 14th (Dublin date) = the previous month's
 * report; from the 15th on = that month's. That covers late reports up to
 * two weeks, the December prompt moved early for Christmas (Sat 19 Dec), and
 * anyone sending theirs a few days before the Saturday.
 *
 * Duplicated in forms/lib/cycle.js - the two apps must file reports
 * identically or the hub and the forms disagree. Change both.
 */
function getCurrentEomCycle(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).split('-').map(Number);
  let year = y;
  let month = m;
  if (d <= EOM_LATE_UNTIL_DAY) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
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
  getCurrentEomCycle,
  isCycleClosed,
  getEomDeadlineMonday,
  CUTOFF_DAY,
};
