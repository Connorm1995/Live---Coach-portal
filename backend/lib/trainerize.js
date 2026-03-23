/**
 * Shared Trainerize API helper
 *
 * Single source of truth for all Trainerize API calls.
 * Includes: auth, 8s timeout with one automatic retry, in-memory caching.
 */

const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------
// Key format: clientId:endpoint:bodyHash
// Each entry: { data, expiresAt }
const cache = new Map();

const TTL_HISTORICAL = 60 * 60 * 1000; // 1 hour
const TTL_CURRENT    = 5 * 60 * 1000;  // 5 minutes
const TIMEOUT_MS     = 8000;           // 8 seconds per call
const RETRY_DELAY_MS = 3000;           // wait 3 seconds before retry

// Determine current Monday in Europe/Dublin
function getCurrentMonday() {
  const now = new Date();
  const dublin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Dublin' }));
  const dow = dublin.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dublin);
  monday.setDate(monday.getDate() + diff);
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Check if a date range falls entirely before the current Monday
function isHistorical(body) {
  if (!body) return false;
  const currentMonday = getCurrentMonday();

  // Single date field
  if (body.date && body.date !== 'last' && body.date < currentMonday) return true;

  // Date range fields
  if (body.endDate && body.endDate < currentMonday) return true;
  if (body.endTime) {
    const endDatePart = body.endTime.split(' ')[0];
    if (endDatePart < currentMonday) return true;
  }

  return false;
}

function getCacheKey(endpoint, body) {
  // Extract clientId from body (userID field in Trainerize API)
  const clientId = body?.userID || 'global';
  const bodyStr = JSON.stringify(body || {});
  return `${clientId}:${endpoint}:${bodyStr}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, body) {
  const ttl = isHistorical(body) ? TTL_HISTORICAL : TTL_CURRENT;
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ---------------------------------------------------------------------------
// Cache invalidation (called from webhook handler)
// ---------------------------------------------------------------------------
// Clears all cache entries for a given Trainerize userID
function invalidateCacheForClient(trainerizeUserId) {
  const prefix = `${trainerizeUserId}:`;
  let cleared = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`[Cache] Invalidated ${cleared} entries for Trainerize user ${trainerizeUserId}`);
  }
}

// ---------------------------------------------------------------------------
// Timeout wrapper with retry
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Core POST helper
// ---------------------------------------------------------------------------
// Returns { data, timedOut } where data is the parsed JSON or null,
// and timedOut is true if the call failed due to timeout after retry.
async function trainerizePost(endpoint, body, { useCache = true, label = 'Trainerize' } = {}) {
  // Check cache first
  if (useCache && body) {
    const key = getCacheKey(endpoint, body);
    const cached = getCached(key);
    if (cached !== null) {
      return { data: cached, timedOut: false, fromCache: true };
    }
  }

  const url = `${TRAINERIZE_API}${endpoint}`;
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify(body),
  };

  // First attempt
  let result = await attempt(url, options, endpoint, label);
  if (result.data !== null) {
    if (useCache && body) setCache(getCacheKey(endpoint, body), result.data, body);
    return { data: result.data, timedOut: false, fromCache: false };
  }

  // Don't retry 4xx errors (client errors like 404 = no data) - only retry on timeout/5xx
  if (!result.shouldRetry) {
    return { data: null, timedOut: false, fromCache: false };
  }

  // Wait and retry once
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await attempt(url, options, endpoint, label);
  if (result.data !== null) {
    if (useCache && body) setCache(getCacheKey(endpoint, body), result.data, body);
    return { data: result.data, timedOut: false, fromCache: false };
  }

  // Both attempts failed
  console.warn(`[${label}] ${endpoint} failed after retry`);
  return { data: null, timedOut: true, fromCache: false };
}

// Returns { data, shouldRetry } where shouldRetry indicates timeout/5xx (worth retrying)
async function attempt(url, options, endpoint, label) {
  try {
    const res = await fetchWithTimeout(url, options);
    if (!res.ok) {
      const isServerError = res.status >= 500;
      if (!isServerError) {
        // 4xx = client error (e.g. 404 no data for that date) - don't log as error, don't retry
        return { data: null, shouldRetry: false };
      }
      console.warn(`[${label}] Trainerize ${endpoint} returned ${res.status}`);
      return { data: null, shouldRetry: true };
    }
    return { data: await res.json(), shouldRetry: false };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[${label}] Trainerize ${endpoint} timed out (${TIMEOUT_MS}ms)`);
    } else {
      console.error(`[${label}] Trainerize ${endpoint} error:`, err.message);
    }
    return { data: null, shouldRetry: true };
  }
}

// ---------------------------------------------------------------------------
// Core GET helper
// ---------------------------------------------------------------------------
async function trainerizeGet(endpoint, { label = 'Trainerize' } = {}) {
  const url = `${TRAINERIZE_API}${endpoint}`;
  const options = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
  };

  let result = await attempt(url, options, endpoint, label);
  if (result.data !== null) return { data: result.data, timedOut: false };
  if (!result.shouldRetry) return { data: null, timedOut: false };

  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await attempt(url, options, endpoint, label);
  if (result.data !== null) return { data: result.data, timedOut: false };

  console.warn(`[${label}] GET ${endpoint} failed after retry`);
  return { data: null, timedOut: true };
}

// ---------------------------------------------------------------------------
// Raw POST helper (no cache, throws on error) - for write operations
// (messaging, file upload, etc. that must not be cached or silently swallowed)
// ---------------------------------------------------------------------------
async function trainerizePostRaw(endpoint, body) {
  const res = await fetchWithTimeout(`${TRAINERIZE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trainerize ${endpoint} responded ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// File upload helper (FormData, no JSON, no cache)
// ---------------------------------------------------------------------------
async function trainerizeUploadFile(formData) {
  const res = await fetch(`${TRAINERIZE_API}/file/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: formData,
  });
  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Trainerize file/upload responded ${res.status}: ${responseText}`);
  }
  let data;
  try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
  return data;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  trainerizePost,
  trainerizeGet,
  trainerizePostRaw,
  trainerizeUploadFile,
  invalidateCacheForClient,
  TRAINERIZE_API,
  TRAINERIZE_AUTH,
};
