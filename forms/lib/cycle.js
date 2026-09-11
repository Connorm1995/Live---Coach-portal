/**
 * Cycle date utilities - deliberate copy of backend/lib/cycle.js (weekly and
 * EOM parts only) so MyFitCoach Forms has zero code dependency on the portal.
 * If the portal's cycle rules ever change, change both copies.
 */

function getCurrentCycleSunday() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const sunday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - day
  ));
  return sunday.toISOString().split('T')[0];
}

// Reports sent on days 1 to this day of a month belong to the previous month.
const EOM_LATE_UNTIL_DAY = 14;

/**
 * The month an End of Month report sent now is FOR, as YYYY-MM-01.
 *
 * The report goes out on the last Saturday of the month, with a Monday
 * deadline that can land in the next month (31 Oct 2026 -> Mon 2 Nov). Filing
 * by calendar month put anything sent on the 1st or 2nd under the NEW month,
 * so it dropped out of the portal's Check-in Hub and its sender still got the
 * "you haven't sent it" reminder.
 *
 * Rule: sent on the 1st to the 14th (Dublin date) = the previous month's
 * report; from the 15th on = that month's. Identical to getCurrentEomCycle in
 * backend/lib/cycle.js - the two apps must agree. Change both.
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

module.exports = { getCurrentCycleSunday, getCurrentEomCycle };
