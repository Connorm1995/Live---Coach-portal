/**
 * Cycle date utilities - deliberate copy of backend/lib/cycle.js (weekly and
 * EOM parts only) so the forms service has zero code dependency on the portal.
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

function getCurrentMonthFirst() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

module.exports = { getCurrentCycleSunday, getCurrentMonthFirst };
