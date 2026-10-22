// Generated with: increase-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Increase uses the Standard Webhooks headers and signed content, but NOT the Standard Webhooks
// key format: the Event Subscription's shared_secret is the HMAC key as raw UTF-8 bytes
// (no whsec_ prefix, no base64 decoding), so the standardwebhooks library can't be used as-is.
//   webhook-id:        the Event ID
//   webhook-timestamp: unix seconds
//   webhook-signature: "v1,<base64 HMAC-SHA256 of '<id>.<timestamp>.<raw body>'>", space-separated
//                      when more than one secret is active
// https://increase.com/documentation/webhooks#securing-your-webhook-endpoint-recommended

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set INCREASE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.INCREASE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`INCREASE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyIncrease(rawBody, headers, secret) {
  if (!secret) return false;

  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  // Increase suggests a 5-minute window. It's opt-in here: off unless
  // INCREASE_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  // The secret is used as-is: raw UTF-8 bytes, not base64-decoded
  const expected = 'v1,' + crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest('base64');
  return signatureHeader.split(' ').some((sig) => safeEqual(sig, expected));
}

// Raw body is required: the signature covers the exact bytes Increase sent.
// type: '*/*' reads the body as a Buffer whatever the content type is.
app.post('/webhooks/increase', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.INCREASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('INCREASE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyIncrease(rawBody, req.headers, secret)) {
    console.error('Increase webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Events are thin: {id, category, associated_object_type, associated_object_id, created_at, type}.
  // Dispatch on category and GET the object from the API if you need its fields.
  // webhook-id (the Event ID) is a good idempotency key: Increase retries failed deliveries.
  switch (event.category) {
    case 'transaction.created':
      console.log(`Transaction created: ${event.associated_object_id}`);
      break;
    case 'pending_transaction.created':
      console.log(`Pending transaction created: ${event.associated_object_id}`);
      break;
    case 'account.created':
      console.log(`Account created: ${event.associated_object_id}`);
      break;
    case 'ach_transfer.created':
    case 'ach_transfer.updated':
      console.log(`ACH transfer ${event.associated_object_id} (${event.category})`);
      break;
    case 'card_payment.created':
      console.log(`Card payment created: ${event.associated_object_id}`);
      break;
    default:
      console.log(`Unhandled event category: ${event.category}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Increase webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyIncrease };
