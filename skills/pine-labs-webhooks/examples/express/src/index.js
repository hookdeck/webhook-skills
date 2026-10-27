// Generated with: pine-labs-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set PINE_LABS_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`PINE_LABS_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// ---------------------------------------------------------------------------
// Pine Labs Online signs with the Standard Webhooks headers:
//   webhook-id         event ID (same when the webhook is resent)
//   webhook-timestamp  Unix seconds when the event was triggered
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the secret key from the Pine Labs dashboard as its raw UTF-8 bytes. Pine Labs'
// docs say to base64-encode the key and then base64-decode it again, which is a no-op.
// Don't use the standardwebhooks or svix libraries: they base64-decode the secret.
// ---------------------------------------------------------------------------

/** Read webhook-* headers; when webhook-id is absent, use the svix-* headers instead. */
function signatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: get(`${prefix}-id`),
    timestamp: get(`${prefix}-timestamp`),
    signature: get(`${prefix}-signature`),
  };
}

/** Standard Webhooks key: base64-decoded `whsec_` secrets, anything else as raw UTF-8 bytes. */
function signingKey(secret) {
  return secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
}

/**
 * Verify a Standard Webhooks delivery from Pine Labs and throw if it's invalid.
 */
function verifySignature(rawBody, { id, timestamp, signature }, secret, toleranceSeconds = timestampToleranceSeconds()) {
  if (!id || !timestamp || !signature) throw new Error('Missing signature headers');
  if (!/^[1-9][0-9]*$/.test(timestamp)) throw new Error('Invalid webhook-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  const key = signingKey(secret);
  if (key.length === 0) throw new Error('Empty signing key'); // fail closed
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // The header is a space-delimited list of "v1,<base64>" entries; any v1 match is valid
  const match = signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

/**
 * Verify a Pine Labs delivery and return the parsed payload.
 *
 * @param {Buffer} rawBody - the exact bytes Pine Labs sent
 * @param {(name: string) => string|undefined} get - header lookup (case-insensitive)
 * @param {string} secret - the secret key from the Pine Labs dashboard, pasted as-is
 * @returns {object} the parsed, verified payload
 * @throws {Error} if the signature (or, when opted in, the timestamp) is invalid
 */
export function verifyPineLabsWebhook(rawBody, get, secret = process.env.PINE_LABS_WEBHOOK_SECRET) {
  verifySignature(rawBody, signatureHeaders(get), secret);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is the same when Pine Labs resends an event.
const processedMessageIds = new Set();

// Order events carry `event_type`; payout events (and some Pay by Points orders) use `eventType`.
const eventTypeOf = (payload) => payload.event_type ?? payload.eventType;

function handleEvent(payload) {
  const type = eventTypeOf(payload);
  const data = payload.data ?? {};
  switch (type) {
    case 'CUSTOMER_ACTIVATED':
    case 'CUSTOMER_DELETED':
    case 'CUSTOMER_SUSPENDED':
    case 'CUSTOMER_CREATION_FAILED':
      console.log(`${type}: customer ${data.customer?.customer_id} (${data.customer?.status})`);
      break;
    case 'ORDER_AUTHORIZED':
    case 'ORDER_PROCESSED':
    case 'ORDER_CANCELLED':
    case 'PAYMENT_FAILED':
    case 'ORDER_FAILED':
    case 'ORDER_SETTLED':
    case 'ORDER_SETTLEMENT_REJECTED':
      // Events can arrive out of order (ORDER_PROCESSED before ORDER_AUTHORIZED): don't assume a sequence
      console.log(`${type}: order ${data.order_id} is ${data.status} (${data.order_amount?.value} ${data.order_amount?.currency})`);
      break;
    case 'REFUND_PROCESSED':
    case 'REFUND_FAILED':
      console.log(`${type}: refund ${data.order_id} of order ${data.parent_order_id} is ${data.status}`);
      break;
    case 'TOKEN_ACTIVATED':
    case 'TOKEN_DEACTIVATED':
    case 'TOKEN_SUSPENDED':
    case 'TOKEN_PROVISION_FAILED':
      console.log(`${type}: token ${data.token?.token_id} (${data.token?.status})`);
      break;
    case 'SUBSCRIPTION_ACTIVATED':
    case 'SUBSCRIPTION_PENDING':
    case 'SUBSCRIPTION_PAUSED':
    case 'SUBSCRIPTION_RESUMED':
    case 'SUBSCRIPTION_COMPLETED':
    case 'SUBSCRIPTION_CHARGED':
    case 'SUBSCRIPTION_HALTED':
    case 'SUBSCRIPTION_CANCELLED':
    case 'SUBSCRIPTION_REVOKE_FAILED':
    case 'SUBSCRIPTION_UPDATED':
    case 'SUBSCRIPTION_UPDATE_FAILED':
      console.log(`${type}: subscription ${data.subscription?.subscription_id} (${data.subscription?.status})`);
      break;
    case 'payout-transaction-success':
    case 'payout-transaction-failed':
      console.log(`${type}: payout ${data.clientReferenceId} (${data.paymentReferenceId}) is ${data.status}`);
      break;
    default:
      console.log(`Unhandled Pine Labs event: ${type}`);
  }
}

// Pine Labs webhook endpoint. express.raw() keeps the exact bytes for the HMAC whatever the
// content type; express.json() before verification would break the signature.
app.post('/webhooks/pine-labs', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.PINE_LABS_WEBHOOK_SECRET) {
    console.error('PINE_LABS_WEBHOOK_SECRET is not set — rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const { id, timestamp, signature } = signatureHeaders((name) => req.get(name));
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let payload;
  try {
    payload = verifyPineLabsWebhook(req.body, (name) => req.get(name));
  } catch (err) {
    console.error('Pine Labs webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (retries) — acknowledge with 200.
  if (processedMessageIds.has(id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously: Pine Labs
    // wants a 2XX within 5 seconds.
    handleEvent(payload);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Pine Labs event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };

// Start the server only when run directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Pine Labs webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pine-labs`);
  });
}
