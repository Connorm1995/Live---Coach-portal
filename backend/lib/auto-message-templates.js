/**
 * Auto message copy.
 *
 * Kept separate from the connector so wording can be edited without touching
 * any logic. Connor's words - do not rewrite these without asking.
 *
 * `{firstName}` is a Trainerize token, resolved by Trainerize at send time.
 * It must be spelled exactly like that: curly braces, no space, capital N.
 * Anything else is sent to the client as literal text.
 *
 * `title` is coach-only. It is the label on the calendar and is never shown to
 * the client, but it is REQUIRED - omitting it returns a 500 from the API.
 *
 * `sendTimeMinutes` is minutes from midnight in the CLIENT's own timezone.
 * 720 = 12:00 local. Not Dublin, not UTC.
 */

const CHECKIN_URL = 'https://forms.myfitcoach.ie/checkin';
const EOM_URL = 'https://forms.myfitcoach.ie/monthly';
const CALENDLY_URL = 'https://calendly.com/myfitcoach-team/gameplancall';

const WEEKLY = {
  kind: 'weekly',
  title: 'EOW Feedback 📝',
  sendTimeMinutes: 720, // 12:00 client-local, Sundays
  occurrences: 52,      // one year
  body: `Good afternoon {firstName},

📝 Please fill out your end-of-week feedback form below:

👉 ${CHECKIN_URL}

Getting this done weekly is vital for success.

It gives structure to the week, lets us both know exactly where you are at, what areas we can look to progress in and what areas we may need to pay more attention to.

Even if things are flying on all fronts, logging is important.

⏰ Reminder: Check-ins are due by Monday 6pm, and will be responded to by Tuesday 12pm.

If it is submitted after 6pm Monday, I can't guarantee a same-week response, but I'll always do my best.

Thank you and enjoy your Sunday!`,
};

const EOM = {
  kind: 'eom',
  title: 'EOM Report 📝',
  sendTimeMinutes: 720, // 12:00 client-local, last Saturday of the month
  occurrences: 12,      // one year
  body: `Good afternoon {firstName},

Let's take stock of your month. There are two options to choose from, pick whichever suits you best:

1. Fill Out the End-of-Month Report

Complete your report using the link below. Please have it submitted by Monday 6pm. I'll review it and have your game plan back to you by Tuesday 12pm.
If it comes in after that, no stress. I'll get back to you as soon as I can, though please bear in mind it may not be until the following Monday.

${EOM_URL}

Or

2. Book a Zoom Call
If you'd prefer to talk it through, pick a slot on the calendar link below.

Please note that calls are set for the first week of the month. If you need to chat outside of that, just message me directly rather than booking a date and we'll sort something that suits.

${CALENDLY_URL}

Looking forward to your update.
Have a great weekend.`,
};

module.exports = { WEEKLY, EOM, CHECKIN_URL, EOM_URL };
