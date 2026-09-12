/**
 * Shared Whoop API helper
 *
 * Single source of truth for every Whoop call, the same way lib/trainerize.js
 * is for Trainerize. Covers the OAuth handshake, token storage, token renewal
 * and the authenticated GET.
 *
 * Two things here are not optional and are the reason this file is longer than
 * it looks like it needs to be:
 *
 *   1. RENEWAL TOKENS ARE SINGLE USE. Every renewal returns a new refresh
 *      token and invalidates the one just used. Lose the new one - by crashing
 *      between the HTTP call and the UPDATE, or by running two renewals at
 *      once - and the connection is dead for good. The client would have to go
 *      through the Whoop approval screen again. Everything in the "renewal"
 *      section exists to make that impossible.
 *
 *   2. TOKENS ARE CREDENTIALS FOR SOMEONE'S HEALTH DATA. They are encrypted
 *      before they touch the database, because the nightly backup to R2 would
 *      otherwise carry live credentials in plain text into object storage.
 */

const crypto = require('crypto');
const pool = require('../db/pool');

const AUTH_URL  = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE  = 'https://api.prod.whoop.com/developer';

const COACH_ID = 1; // Single coach, same as everywhere else in the portal

// Whoop allows 100 requests a minute. Nothing here comes close, but a backfill
// walks pages in a tight loop, so it pauses between them rather than finding
// out what a 429 does to a half-finished import.
const PAGE_PAUSE_MS = 250;
const TIMEOUT_MS    = 10000;
const MAX_PAGES     = 400; // hard stop; 6 months of anything is well under 20

// Renew slightly early. A token that expires while a request is in flight
// looks exactly like a revoked connection, and that distinction matters.
const RENEW_MARGIN_MS = 2 * 60 * 1000;

const SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'offline',
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function clientId() {
  const v = process.env.WHOOP_CLIENT_ID;
  if (!v) throw new Error('WHOOP_CLIENT_ID is not set');
  return v;
}

function clientSecret() {
  const v = process.env.WHOOP_CLIENT_SECRET;
  if (!v) throw new Error('WHOOP_CLIENT_SECRET is not set');
  return v;
}

function redirectUri() {
  const v = process.env.WHOOP_REDIRECT_URI;
  if (!v) throw new Error('WHOOP_REDIRECT_URI is not set');
  return v;
}

/** True when Whoop is configured at all. Lets the UI hide the feature rather
 *  than offer a button that throws. */
function isConfigured() {
  return Boolean(
    process.env.WHOOP_CLIENT_ID &&
    process.env.WHOOP_CLIENT_SECRET &&
    process.env.WHOOP_REDIRECT_URI
  );
}

// ---------------------------------------------------------------------------
// Token encryption
// ---------------------------------------------------------------------------
// AES-256-GCM. The key comes from WHOOP_TOKEN_KEY if it is set, otherwise it is
// derived from PORTAL_SESSION_SECRET, which the server already refuses to boot
// without. That fallback is deliberate: it means connecting a client needs no
// extra environment setup, while still keeping the stored tokens useless to
// anyone holding only a copy of the database.
//
// Rotating PORTAL_SESSION_SECRET therefore invalidates stored Whoop tokens as
// well as sessions. That is recoverable - the client reconnects - and is
// flagged rather than silent, because decryption failures surface as a broken
// connection on the client's page.

function encryptionKey() {
  const explicit = process.env.WHOOP_TOKEN_KEY;
  if (explicit) return crypto.createHash('sha256').update(explicit).digest();
  const fallback = process.env.PORTAL_SESSION_SECRET;
  if (!fallback) throw new Error('No key available to encrypt Whoop tokens');
  return crypto.createHash('sha256').update(`whoop-token:${fallback}`).digest();
}

function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decrypt(stored) {
  if (stored == null) return null;
  const parts = String(stored).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Stored Whoop token is not in the expected format');
  }
  const [, iv, tag, payload] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ---------------------------------------------------------------------------
// OAuth handshake
// ---------------------------------------------------------------------------

/** The URL the client is sent to in order to approve access. `state` is echoed
 *  back on the callback and must be at least 8 characters, per Whoop. */
function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      err.name === 'AbortError'
        ? `Whoop ${label} timed out after ${TIMEOUT_MS}ms`
        : `Whoop ${label} failed: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    // Never log the body wholesale - on some errors Whoop echoes the request,
    // which includes the client secret.
    throw new Error(`Whoop ${label} returned ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Whoop ${label} returned a response that was not JSON`);
  }
}

/** Swap the one-time code from the callback for a token pair. */
async function exchangeCode(code) {
  const data = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
  }, 'code exchange');

  if (!data.access_token) throw new Error('Whoop code exchange returned no access token');
  if (!data.refresh_token) {
    // Almost always means the `offline` scope was left unticked on the app.
    throw new Error(
      'Whoop returned no refresh token. The app is missing the "offline" scope - ' +
      'add it in the Whoop developer dashboard and have the client approve again.'
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

// Within this process, never renew the same connection twice at once.
const inFlight = new Map();

/**
 * Renew a connection's access token and persist the rotated pair.
 *
 * Safe against two callers racing. The row is locked FOR UPDATE for the whole
 * operation, so a second worker blocks, then re-reads and finds a token that is
 * no longer expiring and returns it instead of burning the refresh token a
 * second time. The HTTP call happening inside an open transaction is the point:
 * it is what makes "renewed at Whoop" and "written down here" one step.
 */
async function renew(connectionId) {
  if (inFlight.has(connectionId)) return inFlight.get(connectionId);

  const task = (async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const { rows } = await db.query(
        `SELECT id, refresh_token, access_token, token_expires_at
         FROM client_whoop_connections
         WHERE id = $1 AND revoked_at IS NULL
         FOR UPDATE`,
        [connectionId]
      );
      const row = rows[0];
      if (!row) throw new Error('Whoop connection not found or revoked');

      // Another worker got here first while we waited on the lock.
      const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
      if (expiresAt - Date.now() > RENEW_MARGIN_MS) {
        await db.query('COMMIT');
        return decrypt(row.access_token);
      }

      if (!row.refresh_token) throw new Error('Whoop connection has no refresh token');

      const data = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: decrypt(row.refresh_token),
        client_id: clientId(),
        client_secret: clientSecret(),
        scope: 'offline',
      }, 'token renewal');

      if (!data.access_token) throw new Error('Whoop renewal returned no access token');

      // Whoop rotates the refresh token. If it ever stops sending a new one,
      // keeping the old one is correct - dropping it would be unrecoverable.
      const nextRefresh = data.refresh_token || decrypt(row.refresh_token);
      const expiresIn = Number(data.expires_in) || 3600;

      await db.query(
        `UPDATE client_whoop_connections
         SET access_token = $1,
             refresh_token = $2,
             token_expires_at = now() + ($3 || ' seconds')::interval,
             last_sync_error = NULL
         WHERE id = $4`,
        [encrypt(data.access_token), encrypt(nextRefresh), String(expiresIn), connectionId]
      );

      await db.query('COMMIT');
      return data.access_token;
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      db.release();
    }
  })();

  inFlight.set(connectionId, task);
  try {
    return await task;
  } finally {
    inFlight.delete(connectionId);
  }
}

/** Current access token for a connection, renewing first if it is close to
 *  expiring. */
async function accessTokenFor(connection) {
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expiresAt - Date.now() > RENEW_MARGIN_MS) return decrypt(connection.access_token);
  return renew(connection.id);
}

// ---------------------------------------------------------------------------
// Authenticated requests
// ---------------------------------------------------------------------------

class WhoopError extends Error {
  constructor(message, { status = null, revoked = false } = {}) {
    super(message);
    this.name = 'WhoopError';
    this.status = status;
    this.revoked = revoked;
  }
}

async function rawGet(path, params, token) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET one Whoop endpoint for a connected client.
 *
 * Renews once on a 401 and retries, which covers a token revoked or expired
 * between the check above and the request going out.
 */
async function get(connection, path, params = {}) {
  let token = await accessTokenFor(connection);
  let res;

  try {
    res = await rawGet(path, params, token);
  } catch (err) {
    throw new WhoopError(
      err.name === 'AbortError'
        ? `Whoop ${path} timed out after ${TIMEOUT_MS}ms`
        : `Whoop ${path} failed: ${err.message}`
    );
  }

  if (res.status === 401) {
    token = await renew(connection.id);
    res = await rawGet(path, params, token);
  }

  if (res.status === 401 || res.status === 403) {
    throw new WhoopError(
      'Whoop rejected the connection. The client has most likely revoked access.',
      { status: res.status, revoked: true }
    );
  }
  if (res.status === 429) {
    throw new WhoopError('Whoop rate limit reached', { status: 429 });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new WhoopError(`Whoop ${path} returned ${res.status}`, { status: res.status });
  }

  return res.json();
}

/**
 * Walk every page of a collection endpoint between two instants.
 *
 * Whoop caps `limit` at 25 and pages with an opaque nextToken. Six months of
 * daily records is around eight pages, so this is cheap.
 */
async function getAll(connection, path, { start, end, limit = 25 } = {}) {
  const out = [];
  let nextToken = null;
  let pages = 0;

  do {
    const page = await get(connection, path, {
      start, end, limit,
      nextToken: nextToken || undefined,
    });
    if (!page) break;
    if (Array.isArray(page.records)) out.push(...page.records);
    nextToken = page.next_token || null;
    pages++;
    if (nextToken) await new Promise(r => setTimeout(r, PAGE_PAUSE_MS));
  } while (nextToken && pages < MAX_PAGES);

  if (pages >= MAX_PAGES) {
    console.warn(`[Whoop] ${path} stopped at the ${MAX_PAGES} page ceiling`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connection records
// ---------------------------------------------------------------------------

async function getConnection(clientDbId) {
  const { rows } = await pool.query(
    `SELECT * FROM client_whoop_connections
     WHERE client_id = $1 AND coach_id = $2 AND revoked_at IS NULL`,
    [clientDbId, COACH_ID]
  );
  return rows[0] || null;
}

async function saveConnection(clientDbId, tokens, whoopUserId) {
  const expiresIn = Number(tokens.expires_in) || 3600;
  const { rows } = await pool.query(
    `INSERT INTO client_whoop_connections
       (coach_id, client_id, whoop_user_id, access_token, refresh_token,
        token_expires_at, scopes, connected_at, revoked_at, backfill_done,
        last_sync_error)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' seconds')::interval, $7,
             now(), NULL, false, NULL)
     ON CONFLICT (coach_id, client_id) DO UPDATE SET
       whoop_user_id    = EXCLUDED.whoop_user_id,
       access_token     = EXCLUDED.access_token,
       refresh_token    = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       scopes           = EXCLUDED.scopes,
       connected_at     = now(),
       revoked_at       = NULL,
       backfill_done    = false,
       last_sync_error  = NULL
     RETURNING *`,
    [
      COACH_ID, clientDbId, whoopUserId || null,
      encrypt(tokens.access_token), encrypt(tokens.refresh_token),
      String(expiresIn), tokens.scope || SCOPES.join(' '),
    ]
  );
  return rows[0];
}

/**
 * Disconnect a client.
 *
 * Deletes the stored Whoop data as well as the tokens, and puts the client back
 * on Trainerize in the same transaction. Half a disconnect - tokens gone but
 * the client still marked as Whoop-sourced - would leave a dashboard with no
 * sleep data and no explanation.
 */
async function disconnect(clientDbId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      `UPDATE clients SET health_source = 'trainerize' WHERE id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
    await db.query(
      `DELETE FROM client_whoop_daily WHERE client_id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
    await db.query(
      `DELETE FROM client_whoop_workouts WHERE client_id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
    await db.query(
      `DELETE FROM whoop_connect_links WHERE client_id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
    await db.query(
      `DELETE FROM client_whoop_connections WHERE client_id = $1 AND coach_id = $2`,
      [clientDbId, COACH_ID]
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

async function markRevoked(connectionId, message) {
  await pool.query(
    `UPDATE client_whoop_connections
     SET revoked_at = now(), last_sync_error = $2
     WHERE id = $1`,
    [connectionId, message || 'Access was revoked at Whoop']
  );
}

module.exports = {
  SCOPES,
  isConfigured,
  authorizeUrl,
  exchangeCode,
  get,
  getAll,
  getConnection,
  saveConnection,
  disconnect,
  markRevoked,
  renew,
  WhoopError,
  COACH_ID,
  _test: { encrypt, decrypt },
};
