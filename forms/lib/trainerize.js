/**
 * Trainerize connector for the forms service.
 *
 * This is the ONLY file in the forms service that knows Trainerize exists.
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
 * Create a client in Trainerize from onboarding answers and have Trainerize
 * send them the invitation email (sendMail: true).
 *
 * Returns { trainerizeUserId }.
 */
async function createClient(answers) {
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
  return { trainerizeUserId: result.userID, overLimit: result.code === 1 };
}

module.exports = { createClient, trainerizePost };
