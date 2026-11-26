// Generated with: worldline-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Worldline Connect and Worldline Direct share one webhook signing scheme:
//   X-GCS-Signature = base64( HMAC-SHA256(webhooks secret key, raw body bytes) )
//   X-GCS-KeyId     = id of the webhooks key that signed the message
// No timestamp, no nonce, nothing else in the signing input. The key is the
// dedicated webhooks secret key, NOT the REST API key.
// ---------------------------------------------------------------------------

/**
 * Key id -> secret lookup, seeded from env on every request (so a missing env
 * var fails closed at request time instead of crashing at import).
 * Connect signs with the OLDEST key on the account, so during a rotation both
 * keys must be resolvable by id.
 * @returns {Map<string, string>}
 */
function loadSecretKeyStore() {
  const store = new Map();
  const pairs = [
    [process.env.WORLDLINE_WEBHOOK_KEY_ID, process.env.WORLDLINE_WEBHOOK_SECRET],
    [process.env.WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS, process.env.WORLDLINE_WEBHOOK_SECRET_PREVIOUS],
  ];
  for (const [keyId, secret] of pairs) {
    if (keyId && secret) store.set(keyId, secret);
  }
  return store;
}

/**
 * Verify X-GCS-Signature against the exact bytes Worldline sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-GCS-Signature (standard base64, padded)
 * @param {string} secret - the webhooks secret key for the X-GCS-KeyId on the request
 * @returns {boolean}
 */
function verifyWorldlineSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || signature.length === 0 || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch: check first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Optional defence-in-depth: the custom "webhooks header" (Connect). Never a replacement for the HMAC. */
function customHeaderMatches(req) {
  const name = process.env.WORLDLINE_CUSTOM_HEADER_NAME;
  const value = process.env.WORLDLINE_CUSTOM_HEADER_VALUE;
  if (!name || !value) return true; // layer not configured; the HMAC check still ran
  const a = Buffer.from(req.get(name) || '', 'utf8');
  const b = Buffer.from(value, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Documented event types. Unknown types are acknowledged (2xx), never rejected:
// Connect says "We will add more events in the future".
const CONNECT_EVENTS = new Set([
  'payment.created', 'payment.redirected', 'payment.pending_payment', 'payment.account_verified',
  'payment.pending_fraud_approval', 'payment.authorization_requested', 'payment.pending_approval',
  'payment.pending_completion', 'payment.pending_capture', 'payment.capture_requested',
  'payment.captured', 'payment.paid', 'payment.paid_increment', 'payment.completed',
  'payment.capture_in_progress', 'payment.reversed', 'payment.chargeback_notification',
  'payment.chargebacked', 'payment.rejected', 'payment.rejected_capture', 'payment.cancelled',
  'payment.refunded',
  'refund.created', 'refund.pending_approval', 'refund.rejected', 'refund.refund_requested',
  'refund.captured', 'refund.refunded', 'refund.cancelled',
  'payout.created', 'payout.pending_approval', 'payout.rejected', 'payout.payout_requested',
  'payout.account_credited', 'payout.rejected_credit', 'payout.cancelled', 'payout.reversed',
  'token.created', 'token.updated', 'token.expired', 'token.expiring_soon', 'token.deleted',
  'dispute.draft', 'dispute.created', 'dispute.invalid_representment', 'dispute.send_to_bank',
  'dispute.success', 'dispute.expired', 'dispute.cancelled',
  'capture.created', 'capture.rejected', 'capture.cancelled', 'capture.captured', 'capture.paid',
  'capture.chargebacked', 'capture.chargeback_notification', 'capture.requested',
]);

const DIRECT_EVENTS = new Set([
  'payment.created', 'payment.redirected', 'payment.authorization_requested',
  'payment.pending_approval', 'payment.pending_completion', 'payment.pending_capture',
  'payment.capture_requested', 'payment.captured', 'payment.rejected', 'payment.rejected_capture',
  'payment.cancelled', 'payment.refunded', 'refund.refund_requested',
  'paymentlink.created', 'paymentlink.clicked', 'paymentlink.paid', 'paymentlink.cancelled',
  'paymentlink.expired', 'paymentlink.payment.rejected', 'paymentlink.payment.cancelled',
]);

// Object prefix of `type` -> body key holding the resource. Explicit because
// Direct's `paymentlink.*` events carry the object under `paymentLink`.
const RESOURCE_KEYS = {
  payment: 'payment',
  refund: 'refund',
  payout: 'payout',
  token: 'token',
  dispute: 'dispute',
  capture: 'capture',
  paymentlink: 'paymentLink',
};

/** Everything before the FIRST dot. `paymentlink.payment.rejected` -> `paymentlink`. */
function resourceKeyFor(type) {
  const dot = type.indexOf('.');
  return dot > 0 ? RESOURCE_KEYS[type.slice(0, dot)] : undefined;
}

// Demo-only dedupe store. Use a database unique constraint on the event id in production.
const seenEventIds = new Set();

/**
 * Runs AFTER the 2xx has been sent (Connect times out at 10 seconds).
 * Logs only non-sensitive fields: payloads carry masked PANs, 3-D Secure data and fraud results.
 */
async function processEvent(event) {
  const key = resourceKeyFor(event.type);
  const resource = key ? event[key] : undefined;
  const output = resource?.paymentOutput || resource?.refundOutput || {};
  const summary = {
    eventId: event.id,
    type: event.type,
    merchantId: event.merchantId,
    resourceId: resource?.id,
    status: resource?.status,
    // Amounts are integer minor units: 1000 EUR = EUR 10.00.
    amount: output.amountOfMoney?.amount,
    currency: output.amountOfMoney?.currencyCode,
    // Direct changes payment.id on capture/refund: correlate on merchantReference too.
    merchantReference: output.references?.merchantReference,
  };

  // Arrival order is not event order. Compare against the resource's own status
  // (or re-read it via the REST API) instead of trusting the sequence.
  switch (event.type) {
    case 'payment.captured':
    case 'payment.paid':
    case 'payment.completed':
      console.log('Payment settled: fulfil the order', summary);
      break;
    case 'payment.rejected':
    case 'payment.cancelled':
      console.log('Payment did not complete', summary);
      break;
    case 'refund.refunded':
      console.log('Refund completed', summary);
      break;
    case 'token.deleted':
      // "The event's token payload will contain only an id."
      console.log('Token deleted', { eventId: event.id, tokenId: event.token?.id });
      break;
    case 'dispute.created':
      console.log('Dispute opened', summary);
      break;
    case 'paymentlink.paid':
      console.log('Payment link paid', summary);
      break;
    default:
      console.log('Worldline event received', summary);
  }
  return summary;
}

// Swappable so tests (or a real queue) can take over.
let enqueue = (event) => {
  setImmediate(() => {
    processEvent(event).catch((err) => console.error('Worldline event processing failed:', err.message));
  });
};

const WEBHOOK_PATH = '/webhooks/worldline';

// Connect endpoint verification. When an endpoint is created (or activated),
// Connect sends an UNSIGNED GET with a random string in
// X-GCS-Webhooks-Endpoint-Verification and expects exactly that string back as
// plain text. This route skips the signature check on purpose: it carries no
// payload and changes no state, it only proves you own the URL. It is not a
// bypass of POST verification. Direct documents no such GET; answering it is
// harmless and lets one handler serve both platforms.
app.get(WEBHOOK_PATH, (req, res) => {
  const challenge = req.get('X-GCS-Webhooks-Endpoint-Verification');
  if (!challenge) {
    return res.status(400).type('text/plain').send('Missing X-GCS-Webhooks-Endpoint-Verification header');
  }
  res.set('X-Content-Type-Options', 'nosniff');
  return res.status(200).type('text/plain').send(challenge);
});

// express.raw() keeps the exact bytes for the HMAC. A JSON parse/re-serialise
// round trip changes them (whitespace, number and timestamp formatting).
app.post(WEBHOOK_PATH, express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const store = loadSecretKeyStore();
  if (store.size === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('WORLDLINE_WEBHOOK_KEY_ID / WORLDLINE_WEBHOOK_SECRET not set: rejecting webhook');
    return res.status(401).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('X-GCS-Signature');
  const keyId = req.get('X-GCS-KeyId');
  if (!signature || !keyId) {
    return res.status(401).json({ error: 'Missing X-GCS-Signature or X-GCS-KeyId' });
  }

  // Look the secret up by key id. An unknown id is rejected; never fall back
  // to "the one secret we have".
  const secret = store.get(keyId);
  if (!secret) {
    console.error(`Unknown X-GCS-KeyId ${keyId}: rejecting webhook`);
    return res.status(401).json({ error: 'Unknown key id' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyWorldlineSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!customHeaderMatches(req)) {
    return res.status(401).json({ error: 'Invalid custom header' });
  }

  // An empty body also has a valid signature (Direct's credential self-test
  // relies on that), but it is not an event.
  if (rawBody.length === 0) {
    return res.status(400).json({ error: 'Empty body' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  // The wire format is a bare object. Direct's docs render some samples inside
  // a one-element array; unwrap that defensively.
  if (Array.isArray(event) && event.length === 1) event = event[0];
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Not a Worldline webhook event' });
  }

  // The SDKs throw on apiVersion !== "v1". Log and accept instead, so a future
  // version rollout doesn't 4xx every delivery and burn the retries.
  if (event.apiVersion !== 'v1') {
    console.warn(`Unexpected apiVersion ${event.apiVersion} on event ${event.id}`);
  }

  // Direct only: retry-count is unsigned. Observability, never auth or dedupe.
  const retryCount = req.get('retry-count');
  if (retryCount) console.log(`Worldline delivery ${event.id} retry-count=${retryCount}`);

  // Duplicates are normal on both platforms: dedupe on the top-level id.
  if (seenEventIds.has(event.id)) {
    return res.status(200).json({ received: true, id: event.id, duplicate: true });
  }
  seenEventIds.add(event.id);

  // Connect Configuration Center test events have an id prefixed with TEST.
  if (event.id.startsWith('TEST')) {
    console.log(`Worldline test event ${event.id} (${event.type}): not processed`);
    return res.status(200).json({ received: true, id: event.id, test: true });
  }

  if (!CONNECT_EVENTS.has(event.type) && !DIRECT_EVENTS.has(event.type)) {
    console.log(`Ignoring unknown Worldline event type ${event.type}`);
    return res.status(200).json({ received: true, id: event.id, ignored: 'unknown type' });
  }

  // Respond 2xx immediately, process afterwards.
  res.status(200).json({ received: true, id: event.id, type: event.type });
  enqueue(event);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Worldline webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: GET/POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}

module.exports = {
  app,
  verifyWorldlineSignature,
  loadSecretKeyStore,
  resourceKeyFor,
  processEvent,
  CONNECT_EVENTS,
  DIRECT_EVENTS,
  seenEventIds,
  setEnqueue: (fn) => {
    enqueue = fn;
  },
};
