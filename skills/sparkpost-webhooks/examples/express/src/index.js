// Generated with: sparkpost-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Authentication
//
// SparkPost EVENT WEBHOOKS ARE NOT SIGNED. There is no HMAC, no signature
// header and no signing secret — so there is deliberately no createHmac call
// anywhere in this file's auth path. Authentication is credential based and
// optional, set by the webhook's `auth_type` field, whose enum is exactly
// `none` | `basic` | `oauth2`.
//
// (Bird's newer platform webhooks — bird.com — DO use Standard Webhooks
// signing. That is a different product. Don't implement it here.)
// ---------------------------------------------------------------------------

/**
 * Constant-time string compare via fixed-length digests.
 *
 * crypto.timingSafeEqual THROWS when its inputs differ in length, which is how
 * a naive length check turns a bad credential into a 500. Hashing both sides
 * first gives two 32-byte buffers, so length carries no information and the
 * comparison never throws.
 */
function secureEquals(a, b) {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(a), 'utf8').digest(),
    crypto.createHash('sha256').update(String(b), 'utf8').digest()
  );
}

/**
 * Verify an RFC 7617 Basic credential (`auth_type: "basic"`).
 *
 * SparkPost sends `Authorization: Basic base64(username + ":" + password)`.
 * The credentials are the ones YOUR endpoint defines — the docs stress they are
 * "not your SparkPost username and password".
 */
function verifyBasicAuth(authorizationHeader, username, password) {
  // Fails CLOSED: no header, or no configured username, is a rejection.
  if (!authorizationHeader || username === undefined || username === null || username === '') {
    return false;
  }

  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2) return false;

  // RFC 7617: the scheme token is case-insensitive.
  if (parts[0].toLowerCase() !== 'basic') return false;

  // Buffer.from(x, 'base64') never throws — it silently ignores junk — so
  // validate by looking for the colon rather than trusting the decode.
  const decoded = Buffer.from(parts[1], 'base64').toString('utf8');

  // Split on the FIRST colon only: passwords may contain colons.
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  // `password` is NOT a required field on `auth_credentials` — an empty
  // password is legitimate, so normalise an unset env var to '' rather than
  // treating it as "not configured".
  const expectedPassword = password === undefined || password === null ? '' : password;

  // Compare BOTH halves, and always both, so the response time doesn't reveal
  // which half was wrong.
  const userOk = secureEquals(user, username);
  const passOk = secureEquals(pass, expectedPassword);
  return userOk && passOk;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 (`auth_type: "oauth2"`) — optional Bearer token check.
//
// SparkPost POSTs `auth_request_details.body` (client_id / client_secret /
// grant_type) to YOUR token URL, then sends every batch with
// `Authorization: Bearer {token}`.
//
// THE IN-MEMORY STORE BELOW IS ILLUSTRATIVE. It does not survive a restart and
// does not work across instances. In production you would point
// `auth_request_details.url` at your real authorization server (Auth0, Okta,
// Keycloak, ...) and replace validateBearerToken with JWT signature
// verification or token introspection (RFC 7662).
// ---------------------------------------------------------------------------

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

/** token -> expiry (epoch ms). */
const issuedTokens = new Map();

function issueToken(ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS) {
  const token = crypto.randomBytes(32).toString('hex');
  issuedTokens.set(token, Date.now() + ttlSeconds * 1000);
  return { access_token: token, token_type: 'Bearer', expires_in: ttlSeconds };
}

/**
 * Pluggable Bearer validation. Swap this for JWT verification or introspection.
 *
 * Returning false makes the route answer 401 — which is exactly what SparkPost
 * needs: per the support-doc FAQ, "SparkPost assumes a token is expired if the
 * webhook endpoint returns a response of 400 or 401", and it then requests a
 * new token. Answering 403 would leave it stuck with a dead token.
 */
function validateBearerToken(token) {
  if (!token) return false;
  const expiresAt = issuedTokens.get(token);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    issuedTokens.delete(token);
    return false;
  }
  return true;
}

/** Test seam: register a token with an explicit expiry. */
function _setToken(token, expiresAtMs) {
  issuedTokens.set(token, expiresAtMs);
}

/** Is the OAuth 2.0 demo flow configured at all? */
function oauthConfigured(env = process.env) {
  return Boolean(env.SPARKPOST_OAUTH_CLIENT_ID && env.SPARKPOST_OAUTH_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// Combined auth decision
// ---------------------------------------------------------------------------

/**
 * Authenticate one batch POST.
 *
 * Accepts EITHER a valid Basic header (Mode 1) OR a valid Bearer token
 * (Mode 2) OR — only when SPARKPOST_WEBHOOK_TOKEN is set — the deprecated
 * `X-MessageSystems-Webhook-Token` header.
 *
 * Env is read per request (not at module load) so configuration can change
 * without a restart, and so tests can exercise the unconfigured case.
 *
 * @returns {{ok: boolean, status?: number, reason?: string, mode?: string}}
 */
function authenticateRequest(headers, env = process.env) {
  const authorization = headers['authorization'];
  // Header names arrive lowercased in Express; HTTP header names are
  // case-insensitive, and the docs spell this one several ways.
  const legacyToken = headers['x-messagesystems-webhook-token'];

  const basicConfigured = Boolean(env.SPARKPOST_WEBHOOK_USERNAME);
  const legacyConfigured = Boolean(env.SPARKPOST_WEBHOOK_TOKEN);
  const oauth = oauthConfigured(env);

  // FAIL CLOSED. `auth_type` defaults to "none", which makes "accept anything"
  // tempting — it would let anyone who learns the URL inject fake email events.
  // 500 (not 401) so an operator misconfiguration is distinguishable from a bad
  // caller in the logs.
  if (!basicConfigured && !legacyConfigured && !oauth) {
    return { ok: false, status: 500, reason: 'Webhook authentication not configured' };
  }

  if (basicConfigured && verifyBasicAuth(
    authorization,
    env.SPARKPOST_WEBHOOK_USERNAME,
    env.SPARKPOST_WEBHOOK_PASSWORD
  )) {
    return { ok: true, mode: 'basic' };
  }

  if (oauth && authorization) {
    const parts = authorization.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer' && validateBearerToken(parts[1])) {
      return { ok: true, mode: 'oauth2' };
    }
  }

  // Deprecated header-based token. Also how RELAY webhooks authenticate, since
  // relay webhooks have no Basic Auth mode (their auth_type enum is only
  // `none` | `oauth2`).
  if (legacyConfigured && legacyToken && secureEquals(legacyToken, env.SPARKPOST_WEBHOOK_TOKEN)) {
    return { ok: true, mode: 'legacy-token' };
  }

  return { ok: false, status: 401, reason: 'Unauthorized' };
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

// The seven event-class wrapper keys. The single key under `msys` says which
// class an event belongs to — NEVER hardcode only `message_event`.
const EVENT_CLASSES = new Set([
  'message_event',
  'track_event',
  'gen_event',
  'unsubscribe_event',
  'relay_event',
  'ab_test_event',
  'ingest_event',
]);

/**
 * Batch-level idempotency.
 *
 * "Each webhook batch contains the header X-MessageSystems-Batch-ID, which is
 * useful for detecting and prevention of processing duplicate batches."
 * A duplicate batch still gets a 200 — the support docs are explicit: "If you
 * get a duplicate batch, return a 200 response so SparkPost will not keep
 * retrying."
 *
 * A Set is fine for a demo; use Redis or a table with a TTL in production, and
 * dedupe individual events on `event_id` too.
 */
const seenBatchIds = new Set();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Demo OAuth 2.0 token endpoint — the target for
 * `auth_request_details.url`.
 *
 * Both parsers are mounted because SparkPost's docs do NOT state whether the
 * token request is sent as JSON or as application/x-www-form-urlencoded. A
 * token endpoint should accept both; each parser no-ops when the content type
 * doesn't match.
 */
app.post(
  '/oauth/token',
  express.json(),
  express.urlencoded({ extended: false }),
  (req, res) => {
    if (!oauthConfigured()) {
      return res.status(500).json({ error: 'server_error', error_description: 'OAuth not configured' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientId = body.client_id;
    const clientSecret = body.client_secret;
    const grantType = body.grant_type;

    // grant_type is optional here: SparkPost's documented body includes
    // "client_credentials", but the API reference only says the body "likely
    // should contain the client ID, client secret, and grant type".
    if (grantType !== undefined && grantType !== 'client_credentials') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    if (
      typeof clientId !== 'string' ||
      typeof clientSecret !== 'string' ||
      !secureEquals(clientId, process.env.SPARKPOST_OAUTH_CLIENT_ID) ||
      !secureEquals(clientSecret, process.env.SPARKPOST_OAUTH_CLIENT_SECRET)
    ) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    // Standard OAuth 2.0 token response. The GET webhook response for an
    // oauth2 webhook shows SparkPost storing exactly this shape:
    //   "auth_credentials": { "access_token": "<oauth token>", "expires_in": 3600 }
    res.status(200).json(issueToken());
  }
);

/**
 * Auth middleware, mounted BEFORE the body parser.
 *
 * Ordering matters: if express.json() ran first, a malformed body from an
 * unauthenticated caller would answer 400 before any credential check, leaking
 * that the endpoint exists and parses. Credentials are checked on every batch —
 * including the creation/validation test batch.
 */
function sparkpostAuth(req, res, next) {
  const auth = authenticateRequest(req.headers);

  if (auth.ok) {
    req.sparkpostAuthMode = auth.mode;
    return next();
  }

  console.error(`SparkPost webhook rejected: ${auth.reason}`);
  if (auth.status === 401) {
    // Optional, but it is the correct RFC 7617 response to a rejected Basic
    // credential.
    res.set('WWW-Authenticate', 'Basic realm="sparkpost"');
  }
  return res.status(auth.status).send(auth.reason);
}

/**
 * SparkPost event webhook endpoint.
 *
 * The raw bytes are captured before parsing. Not for verification (nothing is
 * signed) but because the recommended pattern is "Store the raw data to disk or
 * S3 and then asyncronously process it. Defer any processing until after the
 * acceptance response to the webhooks system is made."
 */
app.post(
  '/webhooks/sparkpost',
  sparkpostAuth,
  express.json({
    limit: process.env.SPARKPOST_BODY_LIMIT || '10mb', // batches run to 350+ events
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  (req, res) => {
    // 1. Batch-level dedupe. Case-insensitive lookup: the API reference spells
    //    it X-MessageSystems-Batch-ID, the support docs
    //    X-Messagesystems-Batch-Id. Express lowercases incoming header names.
    const batchId = req.headers['x-messagesystems-batch-id'];

    if (batchId && seenBatchIds.has(batchId)) {
      console.log(`↩︎  Duplicate batch ${batchId} — acknowledging without reprocessing`);
      return res.status(200).send('OK');
    }

    const batch = req.body;

    // The body is always a JSON ARRAY of events. A single object is tolerated
    // defensively; anything else is not a SparkPost batch.
    const events = Array.isArray(batch) ? batch : batch && typeof batch === 'object' ? [batch] : null;

    if (!events) {
      console.error('SparkPost webhook body was not a JSON array');
      return res.status(400).send('Expected a JSON array of events');
    }

    if (batchId) seenBatchIds.add(batchId);

    // 2. Acknowledge with 200 BEFORE doing the work.
    //
    //    The create/validate test explicitly requires 200, and any non-2xx is
    //    retried: "if you do not return a 200 for the batch we will continue to
    //    resend even if you processed and stored part of the batch". The
    //    timeout is 10 seconds, with 12 attempts over 8 hours.
    res.status(200).send('OK');

    // 3. Then process. In production: persist req.rawBody, enqueue, return.
    setImmediate(() => {
      try {
        processBatch(events, batchId);
      } catch (err) {
        console.error(`Error processing SparkPost batch ${batchId}:`, err);
        // Already acknowledged — record the failure and reconcile out of band
        // (the Events API can backfill). Never let this turn into a non-200.
      }
    });
  }
);

function processBatch(events, batchId) {
  console.log(`✓ SparkPost batch ${batchId || '(no batch id)'} — ${events.length} entr(y|ies)`);

  for (const entry of events) {
    if (!entry || typeof entry !== 'object' || typeof entry.msys !== 'object' || entry.msys === null) {
      console.warn('Skipping entry without an msys wrapper');
      continue;
    }

    const keys = Object.keys(entry.msys);

    // THE VALIDATION / TEST BATCH. `POST /api/v1/webhooks/{id}/validate` — and
    // the test POST fired when a webhook is created or its target changes —
    // sends literally `[{"msys":{}}]`: an empty msys object with no event
    // class. It must NOT throw, and the response must be 200, or the webhook
    // cannot be created ("your request to the Webhook API will fail with HTTP
    // 400 and the webhook will not be created"). There is no "ping" event type.
    if (keys.length === 0) {
      console.log('🔎 Validation/test batch (empty msys) — acknowledged');
      continue;
    }

    for (const wrapperKey of keys) {
      const payload = entry.msys[wrapperKey];

      // Relay webhooks are a SEPARATE API (/api/v1/relay-webhooks) that
      // delivers INBOUND EMAIL as msys.relay_message. Not to be confused with
      // `relay_event` (relay_injection / relay_delivery / ... status events,
      // which arrive through event webhooks).
      if (wrapperKey === 'relay_message') {
        handleRelayMessage(payload);
        continue;
      }

      if (!EVENT_CLASSES.has(wrapperKey)) {
        // Additive changes are expected: "Webhooks consumers should be flexible
        // enough to accept additive changes to the payload."
        console.log(`❓ Unknown event class '${wrapperKey}' — logged, not failed`);
        continue;
      }

      handleEvent(wrapperKey, payload || {});
    }
  }
}

function handleEvent(eventClass, event) {
  // Most scalar fields are STRINGS even when numeric: "timestamp":
  // "1460989507" (Unix SECONDS as a string), "num_retries": "2",
  // "bounce_class": "1", "subaccount_id": "101".
  const type = event.type;
  const eventId = event.event_id; // opaque: a big integer for some types, a UUID for others

  // TODO: event-level idempotency — skip if you have already stored eventId.

  switch (type) {
    // --- message_event ---
    case 'delivery':
      console.log(`📬 delivery to ${event.rcpt_to} (message_id=${event.message_id}, retries=${event.num_retries})`);
      break;
    case 'bounce':
    case 'out_of_band':
      console.log(`⛔ ${type} for ${event.rcpt_to}: class=${event.bounce_class} code=${event.error_code} — ${event.reason}`);
      // Suppress the address. bounce_class distinguishes hard from soft.
      break;
    case 'injection':
      console.log(`📥 injection accepted for ${event.rcpt_to} (transmission_id=${event.transmission_id})`);
      break;
    case 'delay':
      console.log(`⏳ delay for ${event.rcpt_to}: code=${event.error_code} retries=${event.num_retries}`);
      break;
    case 'spam_complaint':
      console.log(`🚨 spam_complaint from ${event.rcpt_to} (fbtype=${event.fbtype}, report_by=${event.report_by})`);
      // Remove from all mailing lists immediately.
      break;
    case 'policy_rejection':
      console.log(`🚫 policy_rejection for ${event.rcpt_to}: ${event.reason}`);
      break;
    case 'sms_status':
      console.log(`📱 sms_status ${event.stat_state} for ${event.sms_dst}`);
      break;

    // --- track_event ---
    case 'click':
    case 'amp_click':
      console.log(`🖱  ${type} by ${event.rcpt_to} → ${event.target_link_url} (${event.target_link_name})`);
      break;
    case 'open':
    case 'initial_open':
    case 'amp_open':
    case 'amp_initial_open':
      console.log(`👁  ${type} by ${event.rcpt_to} (${event.geo_ip ? event.geo_ip.country : 'unknown'})`);
      break;

    // --- gen_event ---
    case 'generation_failure':
    case 'generation_rejection':
      console.log(`⚠️  ${type} for ${event.rcpt_to}: ${event.reason} (template=${event.template_id})`);
      break;

    // --- unsubscribe_event ---
    case 'list_unsubscribe':
    case 'link_unsubscribe':
      console.log(`✋ ${type} by ${event.rcpt_to} (campaign=${event.campaign_id})`);
      break;

    // --- relay_event (status events about inbound relaying) ---
    case 'relay_injection':
    case 'relay_rejection':
    case 'relay_delivery':
    case 'relay_tempfail':
    case 'relay_permfail':
      console.log(`🔁 ${type} (${eventClass}) for ${event.rcpt_to}`);
      break;

    // --- ab_test_event ---
    case 'ab_test_completed':
    case 'ab_test_cancelled': {
      const test = event.ab_test || {};
      console.log(`🧪 ${type}: ${test.id} winner=${test.winning_template_id}`);
      break;
    }

    // --- ingest_event ---
    case 'success':
      console.log(`📦 ingest success batch=${event.batch_id} succeeded=${event.number_succeeded} duplicates=${event.number_duplicates}`);
      break;
    case 'error':
      console.log(`📦 ingest error batch=${event.batch_id} type=${event.error_type} failed=${event.number_failed} retryable=${event.retryable}`);
      break;

    default:
      // A type you don't recognise is normal — SparkPost adds event types over
      // time. Log it and keep going; never fail the batch.
      console.log(`❓ Unhandled ${eventClass} type '${type}' (event_id=${eventId})`);
  }
}

/** Inbound email from a RELAY webhook (separate API). */
function handleRelayMessage(message) {
  const content = (message && message.content) || {};
  console.log(`📨 relay_message from ${message && message.msg_from} to ${message && message.rcpt_to}: ${content.subject}`);
  // content.email_rfc822 holds the full MIME message; check
  // content.email_rfc822_is_base64 before decoding.
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  // A malformed JSON body lands here from express.json().
  if (err && err.type === 'entity.parse.failed') {
    console.error('SparkPost webhook body was not valid JSON');
    return res.status(400).send('Invalid JSON');
  }
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`SparkPost webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sparkpost`);
    console.log(`Demo token endpoint: POST http://localhost:${PORT}/oauth/token`);
    if (!process.env.SPARKPOST_WEBHOOK_USERNAME && !oauthConfigured() && !process.env.SPARKPOST_WEBHOOK_TOKEN) {
      console.warn('⚠️  No credentials configured — every batch will be rejected with 500');
      console.warn('   Set SPARKPOST_WEBHOOK_USERNAME (+ PASSWORD) for Basic Auth: auth_type "basic"');
    }
  });
}

module.exports = {
  app,
  server,
  verifyBasicAuth,
  authenticateRequest,
  validateBearerToken,
  secureEquals,
  _setToken,
};
