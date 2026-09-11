/**
 * The welcome direct message a new client receives the moment their
 * onboarding form has created them in Trainerize.
 *
 * Replaces the Zapier step that used to send this after the Typeform
 * onboarding form. Connor's wording, kept exactly - edit the text below to
 * change what new clients receive. The only variable is their first name.
 */

/**
 * People often type their name all in lowercase ("john") or all in capitals.
 * Tidy those, but leave mixed case alone so names like "McKenzie" or
 * "Mary-Kate" stay exactly as the client wrote them.
 */
function tidyFirstName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return '';
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

function welcomeMessage(firstName) {
  const name = tidyFirstName(firstName);
  return `Hi ${name || 'there'},

The app is live. It's bare right now but your full plan will be built out shortly.

In the meantime, there are three things to get sorted:

⚖️ Log your bodyweight tomorrow morning before eating or drinking anything. Bodyweight is only useful when it's taken under the same conditions each time, so first thing in the morning and fasted is the way to go.

📸 Upload your starting photos. In your dashboard, tap the floating + sign, then "photos." Front, side, and back. Plain background, same spot each time. The reason we want these is that sometimes other metrics like bodyweight or waist don't move for a short while, so having progress pictures along the way gives us another way to track progress. It's also great to look back and see the visual progress you've made rather than relying on numbers only.

⌚️ Connect your smart tech. Tap the three dots in the bottom right of your dashboard, scroll to "connect," and link whatever you're using.

If that includes MyFitnessPal, set your diary to "public" in the MFP settings before syncing.

Keep an eye out for your start-up email in the next 24 hours.

Looking forward to getting started with you.`;
}

module.exports = { welcomeMessage, tidyFirstName };
