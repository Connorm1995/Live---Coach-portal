/**
 * Registry of client-facing forms. URL path segment -> form config.
 *
 *   /checkin  weekly check-in  (checkins.type = 'weekly',     cycle = most recent Sunday)
 *   /monthly  EOM report       (checkins.type = 'eom_report', cycle = the month it is for, see cycle.js)
 *
 * Both are one shared public link. The client names themselves at question 1,
 * so on first visit we do not know who they are and the welcome screen uses
 * `titleAnonymous`. Once a browser has submitted once it remembers the name,
 * and returning visits get the personalised `title` instead.
 */

const weeklyDef = require('./checkin-definition');
const eomDef = require('./eom-definition');
const { getCurrentCycleSunday, getCurrentEomCycle } = require('./cycle');

const FORM_TYPES = {
  checkin: {
    dbType: 'weekly',
    def: weeklyDef,
    cycleStart: getCurrentCycleSunday,
    title: 'Weekly Check-In',
    welcome: {
      title: ', ready to check in?',
      titleAnonymous: 'Ready to check in?',
      paragraphs: [
        '<strong>A bit of context goes a long way.</strong> A score tells me what happened, the detail tells us both what to do next. So if something got in the way this week, throw it in. Work, travel, sleep, whatever it was.',
        '<strong>Great week?</strong> Say so! It\'s always good to highlight the wins, so we can double down on what\'s working.',
        'Answers save as you go, so a browser crash won\'t lose anything.',
      ],
      cta: 'Start check-in',
      time: 'Takes about 5 minutes',
      alreadySubmitted: 'You have already checked in this week. Submitting again will send a second check-in for the same week.',
    },
    end: {
      sub: 'Hit submit and your check-in comes straight through to me.',
      button: 'Submit check-in',
      received: 'Check-in received',
      thanks: 'I will review this and come back to you with your feedback. Keep the head down this week.',
    },
  },
  monthly: {
    dbType: 'eom_report',
    def: eomDef,
    cycleStart: getCurrentEomCycle,
    title: 'End of Month Report',
    welcome: {
      title: ', time for your end of month report.',
      titleAnonymous: 'Time for your end of month report.',
      paragraphs: [
        'This is the big picture one: how the month actually went, what got in the way, and where we point things next.',
        'Same as always - the more context you give, the more useful your game plan is. And it\'s always worth highlighting the wins, so we can double down on what\'s working.',
        'Answers save as you go, so a browser crash won\'t lose anything.',
      ],
      cta: 'Start report',
      time: 'Takes about 5 minutes',
      alreadySubmitted: 'You have already sent this month\'s report. Submitting again will send a second report for the same month.',
    },
    end: {
      sub: 'Hit submit and your report comes straight through to me.',
      button: 'Submit report',
      received: 'Report received',
      thanks: 'I will review this and come back to you with your game plan.',
    },
  },
};

module.exports = { FORM_TYPES };
