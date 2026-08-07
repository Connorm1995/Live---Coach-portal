/**
 * Client name matching for the shared-link forms.
 *
 * The weekly and EOM forms are one public link for everybody (the same model
 * Typeform used), so the client identifies themselves by typing their name as
 * question 1. This module turns that typed name into a client row.
 *
 * The algorithm is a deliberate copy of backend/routes/webhooks.js, which has
 * matched 1,000+ Typeform submissions in production. Same normalisation, same
 * Levenshtein ratio, same 0.8 threshold, so a name that matched under Typeform
 * matches identically here. It is duplicated rather than imported because
 * MyFitCoach Forms is intentionally free of any code dependency on the portal.
 *
 * A miss is never fatal. routes/checkin.js stores unmatched submissions in
 * their own table so the answers survive and the coach can assign them by hand.
 */

const MATCH_THRESHOLD = 0.8; // 80% similarity, same as the Typeform webhook

/** Strip accents/fadas, apostrophes and punctuation, lowercase, collapse spaces. */
function normalise(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’'`]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Levenshtein distance (Wagner-Fischer). */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/** Similarity ratio between two names, 0.0 to 1.0. */
function similarity(a, b) {
  const normA = normalise(a);
  const normB = normalise(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(normA, normB) / maxLen;
}

/**
 * Best match for a typed name against a list of { id, name } clients.
 * Returns { match, score } - match is null when the list is empty.
 */
function findBestMatch(submittedName, clients) {
  let match = null;
  let score = 0;
  for (const client of clients) {
    const s = similarity(submittedName, client.name);
    if (s > score) {
      score = s;
      match = client;
    }
  }
  return { match, score };
}

/**
 * Resolve a typed name to a client.
 *
 * Returns { client, bestMatch, score, matched }. `client` is the confident
 * answer and is null below the threshold; `bestMatch` is the nearest name
 * regardless, which is what the admin shows as a suggestion when a submission
 * lands unmatched.
 */
function resolveClient(submittedName, clients) {
  const { match, score } = findBestMatch(submittedName, clients);
  const matched = Boolean(match) && score >= MATCH_THRESHOLD;
  return { client: matched ? match : null, bestMatch: match, score, matched };
}

module.exports = {
  MATCH_THRESHOLD,
  normalise,
  similarity,
  findBestMatch,
  resolveClient,
};
