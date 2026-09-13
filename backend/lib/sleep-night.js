/**
 * Which night a sleep belongs to.
 *
 * A night spans midnight, so "Monday's sleep" has to be defined. The portal's
 * rule, unchanged: a sleep that STARTS before noon is credited to the previous
 * day, so 1am Tuesday is Monday night.
 *
 * What this adds is whose noon. The rule used to be hardcoded to Europe/Dublin
 * and lived in three identical copies across routes/client-overview.js and
 * routes/calendar.js. Dublin is right for a coach and client both in Ireland
 * and wrong the moment a client is not.
 *
 * Cian is in Australia and goes to bed around 22:00 his time, which reads as
 * 13:00 in Dublin - an hour clear of the boundary. From 25 Oct 2026, when
 * Ireland leaves summer time while Australia is on AEDT, the same bedtime reads
 * as 11:00 Dublin, trips the "before noon" rule, and moves every one of his
 * nights back a day. Nothing errors; the dates are just quietly wrong.
 *
 * Worse, it would have been wrong INCONSISTENTLY. lib/whoop-store.js already
 * buckets by the client's own offset, so the Whoop panel and the sleep tile on
 * the same page would have disagreed about which day a night was.
 *
 * So: when the segment carries the offset the client was actually in, that
 * wins. Trainerize segments carry none and fall back to Dublin, behaving
 * exactly as they always have.
 */

const TZ = 'Europe/Dublin';

function dublinDateStr(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}

function dublinHour(date) {
  const parts = new Intl.DateTimeFormat('en-IE', {
    timeZone: TZ, hour: 'numeric', hour12: false,
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === 'hour').value, 10);
}

/** "+10:00" / "-05:30" -> minutes. null when unrecognised. */
function offsetMinutes(offset) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset || '').trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * @param {Date}   start  when the sleep began
 * @param {string} [tz]   the client's UTC offset for that night, if known
 * @returns {string} YYYY-MM-DD
 */
function nightDateFor(start, tz) {
  const mins = offsetMinutes(tz);

  if (mins == null) {
    if (dublinHour(start) < 12) {
      const prev = new Date(start);
      prev.setUTCDate(prev.getUTCDate() - 1);
      return dublinDateStr(prev);
    }
    return dublinDateStr(start);
  }

  const local = new Date(start.getTime() + mins * 60000);
  if (local.getUTCHours() < 12) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().split('T')[0];
}

module.exports = { nightDateFor, offsetMinutes, _test: { dublinDateStr, dublinHour } };
