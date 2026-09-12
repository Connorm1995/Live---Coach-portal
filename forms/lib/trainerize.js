/**
 * Trainerize connector for MyFitCoach Forms.
 *
 * This is the ONLY file in MyFitCoach Forms that knows Trainerize exists.
 * If the coaching platform ever changes, replace this module and the
 * onboarding flow keeps working - the form, storage, and admin never touch
 * Trainerize directly.
 *
 * Auth mirrors backend/lib/trainerize.js (Basic GROUP_ID:API_TOKEN), with an
 * 8s timeout and one automatic retry on network failure.
 */

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const COACH_TRAINERIZE_ID = 5343380; // same trainer ID the portal uses
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 3000;

function authHeader() {
  return 'Basic ' + Buffer.from(
    `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
  ).toString('base64');
}

async function trainerizePost(endpoint, body, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const message = (json && (json.message || json.error)) || text.slice(0, 300) || `HTTP ${res.status}`;
      const err = new Error(`Trainerize ${endpoint} ${res.status}: ${message}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } catch (err) {
    // One retry on network-level failures (timeout, connection reset)
    if (attempt === 1 && (err.name === 'AbortError' || err.code === 'ECONNRESET' || err.message.includes('fetch failed'))) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return trainerizePost(endpoint, body, 2);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Put a user tag on a client.
 *
 * The tag is how Trainerize records which programme someone is on, and the
 * Coach Portal's nightly reconcile reads it back as the source of truth. A
 * client created without one is not wrong in the portal, but they are missing
 * from every tag-based view in the Trainerize app itself.
 */
async function addTag(trainerizeUserId, tagName) {
  return trainerizePost('/user/addTag', {
    userID: Number(trainerizeUserId),
    userTag: tagName,
  });
}

/** Is this client already carrying the named tag? */
async function hasTag(trainerizeUserId, tagName) {
  const tagList = await trainerizePost('/userTag/getList', {});
  const tag = (tagList.userTags || []).find((t) => t.name === tagName);
  if (!tag) return false;
  const data = await trainerizePost('/user/getClientList', {
    userID: COACH_TRAINERIZE_ID,
    view: 'activeClient',
    filter: { userTag: tag.id },
    start: 0,
    count: 100,
  });
  return (data.users || []).some((u) => Number(u.id) === Number(trainerizeUserId));
}

/**
 * Put a tag on a client, treating "already has it" as success.
 *
 * /user/addTag is NOT idempotent: tagging someone who already carries the tag
 * returns a 500 reading "Failed to add user to user tag", which is
 * indistinguishable from a real failure. Verified against a live client on
 * 12 Sep 2026. That matters on the admin Retry button, where a second run
 * would otherwise report a tag problem that does not exist.
 *
 * So a failure is checked rather than believed: if the tag is on the client
 * afterwards, the job is done.
 */
async function ensureTag(trainerizeUserId, tagName) {
  try {
    await addTag(trainerizeUserId, tagName);
  } catch (err) {
    if (await hasTag(trainerizeUserId, tagName)) return;
    throw err;
  }
}

/**
 * Create a client in Trainerize from onboarding answers and have Trainerize
 * send them the invitation email (sendMail: true), then put them on the
 * programme tag.
 *
 * Returns { trainerizeUserId, overLimit, tagError }.
 *
 * `tagError` rather than a throw: by the time the tag is attempted the client
 * exists and their invite is on its way, so a tag failure must not fail the
 * sign-up. It is handed back for the caller to record against the submission,
 * where Connor can see it and fix the tag by hand.
 */
async function createClient(answers, { tag } = {}) {
  const payload = {
    user: {
      firstName: String(answers.first_name || '').trim(),
      lastName: String(answers.surname || '').trim(),
      email: String(answers.email || '').trim(),
      phone: String(answers.phone || '').trim() || undefined,
      birthDate: answers.dob || undefined,          // YYYY-MM-DD from the date input
      height: parseInt(answers.height, 10) || undefined,
      type: 'client',
      trainerID: COACH_TRAINERIZE_ID,
      settings: {
        enableSignin: true,
        enableMessage: true,
        unitWeight: 'kg',
        unitBodystats: 'cm',
        unitDistance: 'km',
      },
    },
    sendMail: true,
  };
  if (payload.user.height) payload.unitHeight = 'cm';

  const result = await trainerizePost('/user/add', payload);
  if (result == null || result.userID == null) {
    throw new Error(`Trainerize /user/add returned no userID (${JSON.stringify(result).slice(0, 200)})`);
  }
  // code 0 = created; code 1 = created but queued as over plan limit - both
  // give a real userID, and the invite still goes out when a seat frees up.
  let tagError = null;
  if (tag) {
    try {
      await ensureTag(result.userID, tag);
    } catch (err) {
      console.error('[onboarding] Tag failed:', err.message);
      tagError = err.message;
    }
  }
  return { trainerizeUserId: result.userID, overLimit: result.code === 1, tagError };
}

/**
 * Send a direct message into the client's main Trainerize thread, from the
 * coach. Same payload the Coach Portal's reminders use.
 *
 * Called with attempt = 2 so the automatic network retry is skipped: a
 * timeout does not prove Trainerize failed to deliver, and retrying could
 * send the client the same message twice. A genuine failure is left for the
 * coach to resend from the admin area.
 */
async function sendMessage(trainerizeUserId, body) {
  return trainerizePost('/message/send', {
    recipients: [Number(trainerizeUserId)],
    body,
    threadType: 'mainThread',
    conversationType: 'single',
    type: 'text',
  }, 2);
}

module.exports = { createClient, addTag, hasTag, ensureTag, sendMessage, trainerizePost };
