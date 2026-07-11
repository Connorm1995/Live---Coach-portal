/**
 * Registry of client-facing forms. URL path segment -> form config.
 *
 *   /checkin/<token>  weekly check-in  (checkins.type = 'weekly',    cycle = most recent Sunday)
 *   /monthly/<token>  EOM report       (checkins.type = 'eom_report', cycle = 1st of month)
 */

const weeklyDef = require('./checkin-definition');
const eomDef = require('./eom-definition');
const { getCurrentCycleSunday, getCurrentMonthFirst } = require('./cycle');

const FORM_TYPES = {
  checkin: {
    dbType: 'weekly',
    def: weeklyDef,
    cycleStart: getCurrentCycleSunday,
    title: 'Weekly Check-In',
    welcome: {
      title: ', ready to check in?',
      paragraphs: [
        '<strong>Bad week?</strong> Tell me why, not just that you didn\'t do it. "Work blew up Tue-Thu so I skipped training" I can coach. "I knew what to do and didn\'t" I can\'t.',
        '<strong>Great week?</strong> Say so! No need to invent problems when things are going really well - "bang on, nothing to flag" is a great answer.',
        'Answers save as you go, so a browser crash won\'t lose anything.',
      ],
      cta: 'Start check-in',
      time: 'Takes about 5 minutes',
      alreadySubmitted: 'You have already checked in this week. Submitting again will send a second check-in for the same week.',
    },
  },
  monthly: {
    dbType: 'eom_report',
    def: eomDef,
    cycleStart: getCurrentMonthFirst,
    title: 'End of Month Report',
    welcome: {
      title: ', time for your end of month report.',
      paragraphs: [
        'This is the big picture one: how the month actually went, what got in the way, and where we point things next.',
        'Same rules as always - honest answers beat impressive ones, and "bang on, nothing to flag" is a great answer when it\'s true.',
        'Answers save as you go, so a browser crash won\'t lose anything.',
      ],
      cta: 'Start report',
      time: 'Takes about 5 minutes',
      alreadySubmitted: 'You have already sent this month\'s report. Submitting again will send a second report for the same month.',
    },
  },
};

module.exports = { FORM_TYPES };
