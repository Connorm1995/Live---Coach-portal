/**
 * Security headers for the Coach Portal, including the Content Security Policy.
 *
 * Pulled out of server.js into its own file for one reason: server.js cannot be
 * started on a development machine without also starting the scheduler, which
 * would send real messages to real clients from the live database. Keeping the
 * headers here means the policy can be loaded and exercised on its own, against
 * the real built bundle and the real login page, without any of that.
 *
 * ---------------------------------------------------------------------------
 * What the Content Security Policy is for
 * ---------------------------------------------------------------------------
 * A browser runs whatever code it finds on a page. It cannot tell our code from
 * anyone else's. This header is the list of places code and styling are allowed
 * to come from; the browser refuses everything else.
 *
 * It matters here because text we did not write does reach these pages: the
 * check-in link is public by design, and /webhooks/* is deliberately
 * unauthenticated. If any of that text ever contained something shaped like
 * code, this is what stops the browser running it.
 *
 * ---------------------------------------------------------------------------
 * Every entry below was checked against the real assets, not guessed
 * ---------------------------------------------------------------------------
 * A policy that is too strict fails SILENTLY - the page still renders and looks
 * completely normal while a button quietly does nothing. So each source here is
 * traceable to something that actually loads:
 *
 *  script-src  'self' only. The production build puts all JavaScript in
 *              /static/js/*.js with nothing inline in index.html, so no nonce,
 *              no hash and no 'unsafe-inline' is needed. Verified against the
 *              built index.html, which contains a single <script src> tag.
 *              Lazy-loaded chunks are fetched from our own origin and match.
 *
 *  style-src   'self' for /static/css/*.css, the Google Fonts stylesheet by
 *              host, and a per-request nonce for exactly one inline <style>:
 *              the login page, which is a self-contained page generated in
 *              auth.js. A nonce rather than a hash so that editing the login
 *              page's CSS can never silently break its own styling.
 *              React's style={{...}} prop is not affected by this - it sets
 *              styles through the CSSOM, which CSP does not police.
 *
 *  font-src    fonts.gstatic.com. The Google Fonts stylesheet is served from
 *              fonts.googleapis.com but the font files themselves come from
 *              gstatic. Allowing only the first gives text with no DM Sans.
 *
 *  img-src     'self' for the logo and favicon; data: for two real cases - the
 *              preview shown when a file is attached in Messages (a FileReader
 *              data URL) and an inline SVG background in the built CSS; and
 *              api.trainerize.com for image attachments inside message threads.
 *
 *  media-src   api.trainerize.com. Video attachments in Messages render in a
 *              <video> element pointed straight at the Trainerize file API.
 *              This is easy to miss because it is covered by neither img-src
 *              nor connect-src.
 *
 *  connect-src 'self'. Every API call the dashboard makes is same-origin.
 *              Trainerize is only ever reached from the server, never the
 *              browser, apart from the img/video sources above.
 *
 * Links out to Loom, MyFitnessPal and bit.ly need no entry - CSP does not
 * restrict where an <a href> points, only what the page loads and runs.
 *
 * frame-ancestors repeats X-Frame-Options in modern form; both are sent because
 * they are read by different browser versions. form-action pins the login and
 * "log out everywhere" posts to our own origin. base-uri stops an injected
 * <base> tag repointing every relative URL on the page.
 */

const crypto = require('crypto');

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';
const TRAINERIZE_FILES = 'https://api.trainerize.com';

/** Build the policy string. Split out so tests can read it without a request. */
function buildPolicy(nonce) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    `style-src 'self' 'nonce-${nonce}' ${GOOGLE_FONTS_CSS}`,
    `font-src 'self' ${GOOGLE_FONTS_FILES}`,
    `img-src 'self' data: ${TRAINERIZE_FILES}`,
    `media-src 'self' ${TRAINERIZE_FILES}`,
    "connect-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

function makeNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Express middleware.
 *
 * `isHttps` is injected rather than imported so this file has no dependency on
 * auth.js, and therefore none on the database. That is what lets it be loaded
 * and tested on its own.
 *
 * `reportOnly` sends the policy as Content-Security-Policy-Report-Only, where
 * the browser reports what it WOULD have blocked and blocks nothing. Not used
 * on the portal, which only Connor uses and where a mistake costs a refresh.
 * It is here for MyFitCoach Forms, where a mistake would land on a client
 * mid-check-in and should be caught in watching mode first.
 */
function securityHeaders({ isHttps, reportOnly = false } = {}) {
  if (typeof isHttps !== 'function') {
    throw new Error('securityHeaders requires an isHttps(req) function');
  }
  const headerName = reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';

  return function securityHeadersMiddleware(req, res, next) {
    // Sent only on real https requests - browsers ignore HSTS over plain http,
    // and this must not depend on NODE_ENV, which went missing on the deployed
    // service and silently took the cookie's Secure flag with it.
    if (isHttps(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // A fresh nonce per request. Pages that render an inline <style> read it
    // from res.locals; everything else simply ignores it.
    const nonce = makeNonce();
    res.locals.cspNonce = nonce;
    res.setHeader(headerName, buildPolicy(nonce));

    next();
  };
}

module.exports = { securityHeaders, buildPolicy, makeNonce };
