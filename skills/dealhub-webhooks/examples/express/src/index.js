// Generated with: dealhub-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * DEALHUB WEBHOOK AUTHENTICATION
 *
 * DealHub does NOT sign webhooks. There is no signature header, no HMAC and no
 * timestamp. Instead, each webhook is configured (System Settings -> API
 * Settings -> Webhooks) with one of three Authentication Types:
 *
 *   Token : DealHub sends  Authorization: Bearer <TOKEN>
 *   Basic : DealHub sends  Authorization: Basic <CREDENTIALS>
 *   None  : no header (only for endpoints with no auth, or a SAS token in the URL)
 *
 * CAVEAT: the credential is the FULL Authorization header value, scheme
 * included. Build the exact string you expect ("Bearer <TOKEN>" or
 * "Basic base64(username:password)") and compare the whole header against it
 * in constant time. Don't strip the scheme and compare only the token.
 */

/**
 * Build the Authorization header value DealHub should send, from env config.
 * Returns null when nothing is configured (the handler then fails closed).
 */
function expectedAuthorization(env = process.env) {
  if (env.DEALHUB_WEBHOOK_TOKEN) {
    return `Bearer ${env.DEALHUB_WEBHOOK_TOKEN}`;
  }
  if (env.DEALHUB_WEBHOOK_USERNAME && env.DEALHUB_WEBHOOK_PASSWORD) {
    const credentials = Buffer.from(
      `${env.DEALHUB_WEBHOOK_USERNAME}:${env.DEALHUB_WEBHOOK_PASSWORD}`,
      'utf8'
    ).toString('base64');
    return `Basic ${credentials}`;
  }
  return null;
}

/**
 * Constant-time compare of the full Authorization header value.
 *
 * @param {string|undefined} header  The received Authorization header
 * @param {string} expected          e.g. "Bearer <TOKEN>" or "Basic <CREDENTIALS>"
 * @returns {boolean}
 */
function verifyDealhubAuthorization(header, expected) {
  if (!header || !expected) return false;
  const a = Buffer.from(String(header), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * DealHub webhook endpoint.
 *
 * There is no body signature, so the raw body isn't needed for verification.
 * express.raw() is still used so the handler authenticates BEFORE it parses,
 * and can return a clean 400 on malformed JSON.
 */
app.post('/webhooks/dealhub', express.raw({ type: '*/*' }), (req, res) => {
  const expected = expectedAuthorization();

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error(
      'Set DEALHUB_WEBHOOK_TOKEN (Token mode) or DEALHUB_WEBHOOK_USERNAME and ' +
        'DEALHUB_WEBHOOK_PASSWORD (Basic mode) — refusing unauthenticated webhooks'
    );
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  const authorization = req.headers['authorization'];
  if (!authorization) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  if (!verifyDealhubAuthorization(authorization, expected)) {
    console.error('DealHub webhook Authorization header mismatch');
    return res.status(401).json({ error: 'Invalid Authorization header' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // event_info.event_id identifies this event notification: use it as your
  // idempotency key. Fall back defensively; documented examples omit event_info.
  const eventId = payload?.event_info?.event_id;

  console.log(`✓ Authenticated DealHub webhook: ${eventName(payload)} (${eventId ?? 'no event_id'})`);

  handleEvent(payload);

  res.status(200).json({ received: true });
});

/** The DealHub event name lives in the payload's `event` field. */
function eventName(payload) {
  if (payload && typeof payload.event === 'string') return payload.event;
  // "Failure WebHook v1" is documented with only error_code / error_description.
  if (payload && ('error_code' in payload || 'error_description' in payload)) {
    return 'Failure WebHook v1';
  }
  return 'unknown';
}

function handleEvent(payload) {
  // TODO: check payload.event_info?.event_id against your store and return if seen.
  switch (eventName(payload)) {
    // --- Quote entity events ------------------------------------------------
    case 'draftQuote':
      console.log(
        `📝 Draft quote ${payload.dealhub_quote_id} ` +
          `(${payload.newly_created_quote ? 'created' : 'updated'})`
      );
      break;
    case 'primaryQuote':
      // Only the NEW primary quote is sent; infer that the previous one lost the flag.
      console.log(`⭐ Primary quote ${payload.dealhub_quote_id} for opportunity ${payload.dealhub_opportunity_id}`);
      break;
    case 'quotePendingApproval':
      console.log(`⏳ Quote pending approval: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteReady':
      console.log(`✅ Quote ready to send: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteRejected':
      console.log(`❌ Quote rejected: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteRecalled':
      console.log(`↩️  Quote recalled: ${payload.dealhub_quote_id}`);
      break;
    case 'quotePublished':
      console.log(`📤 Quote published to DealRoom: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteUnpublished':
      console.log(`📥 Quote unpublished: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteWon':
      console.log(`🏆 Quote won: ${payload.dealhub_quote_id}`);
      break;

    // --- Version / user events (dispatch on `action`) -----------------------
    case 'version':
      // action: created | activated | reactivated
      console.log(`🧩 Version ${payload.version_id} ${payload.action} (status ${payload.status})`);
      break;
    case 'user':
      // action: created | modified | deleted
      console.log(`👤 User ${payload.user_login} ${payload.action}`);
      break;

    // --- System & async events ----------------------------------------------
    case 'productsUpload':
      // upload_status: success | error; event_info.request_id identifies the upload
      console.log(
        `📦 Products upload ${payload.upload_status} for version ${payload.version_id} ` +
          `(${payload.imported_skus} SKUs)`
      );
      break;
    case 'crmImport':
      console.log('🔄 CRM import completed');
      break;
    case 'Failure WebHook v1':
      console.log(`⚠️  Async request failed: ${payload.error_code} ${payload.error_description}`);
      break;

    // --- DealRoom events ----------------------------------------------------
    case 'DEALROOM_EVENT': {
      // The specific activity is the key of action_summary, e.g. DEAL_SIGN.
      const [activity] = Object.keys(payload.action_summary || {});
      console.log(`🏠 DealRoom activity ${activity} on quote ${payload.dealhub_quote_id}`);
      break;
    }

    default:
      console.log(`Unhandled DealHub event: ${eventName(payload)}`);
  }
}

module.exports = { app, expectedAuthorization, verifyDealhubAuthorization, eventName };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DealHub webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/dealhub`);
  });
}
