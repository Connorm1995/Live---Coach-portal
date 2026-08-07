/**
 * Minimal S3 client for Cloudflare R2, where the backups live.
 *
 * Deliberately dependency-free. The AWS SDK would work, but it is a large
 * dependency added to a deploy whose only job here is PUT, GET, LIST and
 * DELETE on one bucket. Everything below is AWS Signature V4 over Node's
 * built-in crypto and fetch.
 *
 * R2 specifics:
 *   endpoint  https://<account>.<jurisdiction>.r2.cloudflarestorage.com
 *   region    "auto" (R2 has no regions; the signature still needs a value)
 *   service   "s3"
 *
 * JURISDICTION MATTERS. The backup bucket is created with EU jurisdiction so
 * that health data about identifiable EU residents stays in the EU, which is
 * special category data under GDPR Article 9. An EU bucket is NOT reachable on
 * the default endpoint - it answers 403 AccessDenied there, which reads like a
 * credentials problem and is not. Default is 'eu' for exactly that reason; set
 * R2_JURISDICTION=default only for a bucket created without a jurisdiction.
 *
 * The credentials are scoped to the backup bucket only, so a leak cannot
 * reach anything else in the Cloudflare account - notably not the DNS.
 */

const crypto = require('crypto');

const REGION = 'auto';
const SERVICE = 's3';

function cfg() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const missing = Object.entries({ R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`R2 not configured - missing ${missing.join(', ')}`);
  const jurisdiction = (process.env.R2_JURISDICTION || 'eu').toLowerCase();
  const host = jurisdiction === 'default'
    ? `${accountId}.r2.cloudflarestorage.com`
    : `${accountId}.${jurisdiction}.r2.cloudflarestorage.com`;
  return { accountId, accessKeyId, secretAccessKey, bucket, host };
}

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** Each path segment is encoded, but the slashes between them are not. */
function encodeKey(key) {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

/**
 * Sign and send one request.
 *
 * `body` may be a Buffer (PUT) or undefined. Query parameters must already be
 * sorted by the caller - SigV4 requires the canonical query string to be in
 * ascending key order.
 */
async function signedRequest({ method, key = '', query = {}, body, extraHeaders = {} }) {
  const { accessKeyId, secretAccessKey, bucket, host } = cfg();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20260806T214000Z
  const dateStamp = amzDate.slice(0, 8);                             // 20260806

  const payload = body || Buffer.alloc(0);
  const payloadHash = sha256hex(payload);

  const canonicalUri = '/' + bucket + (key ? '/' + encodeKey(key) : '');
  const canonicalQuery = Object.keys(query).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };
  const signedHeaderNames = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames
    .map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), REGION), SERVICE), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}${canonicalQuery ? '?' + canonicalQuery : ''}`;
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'PUT' || method === 'POST' ? payload : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`R2 ${method} ${key || '(bucket)'} failed: ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/** Upload an object. */
async function put(key, buffer, contentType = 'application/octet-stream') {
  await signedRequest({
    method: 'PUT', key, body: buffer,
    extraHeaders: { 'content-type': contentType, 'content-length': String(buffer.length) },
  });
  return { key, bytes: buffer.length };
}

/** Download an object as a Buffer. Returns null if it does not exist. */
async function get(key) {
  try {
    const res = await signedRequest({ method: 'GET', key });
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Delete an object. */
async function del(key) {
  await signedRequest({ method: 'DELETE', key });
}

/**
 * List objects under a prefix. Follows continuation tokens, so the result is
 * complete rather than the first 1000.
 */
async function list(prefix = '') {
  const out = [];
  let token;
  do {
    const query = { 'list-type': '2', prefix };
    if (token) query['continuation-token'] = token;
    const res = await signedRequest({ method: 'GET', query });
    const xml = await res.text();

    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const block = m[1];
      const pick = (tag) => (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1];
      out.push({
        key: pick('Key'),
        size: Number(pick('Size') || 0),
        lastModified: pick('LastModified'),
      });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = truncated ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1] : null;
  } while (token);

  return out.sort((a, b) => (a.key < b.key ? 1 : -1)); // newest first, keys are date-prefixed
}

/** True when all four settings are present. Lets callers skip cleanly. */
function isConfigured() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

module.exports = { put, get, del, list, isConfigured };
