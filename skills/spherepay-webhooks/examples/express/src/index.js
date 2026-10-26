// Generated with: spherepay-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// SpherePay signs every delivery (this is NOT Standard Webhooks: do not use the standardwebhooks
// or svix libraries):
//   Sphere-Signature = hex( HMAC-SHA256( secret, "{Sphere-Timestamp}.{raw body}" ) )
// The secret is the endpoint's whole whsec_... string, used as a plain UTF-8 key (not decoded).
// https://docs.spherepay.co/concepts/webhooks/verifying-signatures

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
// original Sphere-Timestamp, so a window would reject legitimate redeliveries. Set
// SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Signed message as bytes: timestamp header (latin1, exactly as received) + "." + raw body bytes
function computeSignature(rawBody, timestamp, secret) {
  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest('hex');
}

function verifySpherePay(rawBody, headers, secret) {
  if (!secret) return false;

  const signature = headers['sphere-signature'];
  const timestamp = headers['sphere-timestamp'];
  if (typeof signature !== 'string' || typeof timestamp !== 'string') return false;
  if (!signature || !timestamp) return false;

  // The whole header is one bare hex digest: validate it before decoding (Buffer.from(x, 'hex')
  // silently drops bad characters). Hex is case-insensitive.
  if (!HEX_SHA256.test(signature)) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  const expected = Buffer.from(computeSignature(rawBody, timestamp, secret), 'hex');
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// SpherePay makes ONE attempt per event (no automatic retries) and expects a 2xx within 15 seconds.
// Raw body is required: the signature covers the exact bytes SpherePay sent, whatever the content type.
app.post('/webhooks/spherepay', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SPHEREPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SPHEREPAY_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySpherePay(rawBody, req.headers, secret)) {
    console.error('SpherePay webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Delivery is at-least-once and unordered: dedupe on event.id, compare event.sequence for staleness
  const data = event.data || {};
  switch (event.type) {
    case 'customer.created':
    case 'customer.pending':
      console.log(`Customer ${data.id} (${event.type}): ${data.status}`);
      break;
    case 'customer.approved':
      console.log(`Customer approved: ${data.id} (profile ${data.verificationProfile})`);
      break;
    case 'customer.rejected':
      console.log(`Customer rejected: ${data.id} (profile ${data.verificationProfile})`);
      break;
    case 'transfer.created':
    case 'transfer.pendingFunding':
    case 'transfer.pendingReview':
    case 'transfer.fundsReceived':
    case 'transfer.processing':
      console.log(`Transfer ${data.id} (${event.type}): ${data.previousStatus} -> ${data.status}`);
      break;
    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${data.id} for customer ${data.customerId}`);
      break;
    case 'transfer.returned':
    case 'transfer.refunded':
    case 'transfer.failed':
      console.log(`Transfer ${data.id} (${event.type}): ${data.previousStatus} -> ${data.status}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SpherePay webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifySpherePay, computeSignature };
