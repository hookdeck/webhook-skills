// Generated with: paynow-gg-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// A PayNow signature is the 44-character padded standard base64 of a SHA-256 digest
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify PayNow's PayNow-Signature header.
 *
 * Signed message (as bytes): PayNow-Timestamp header value + "." + raw request body.
 * Signature: base64(HMAC-SHA256(secret, message)), the whole header value.
 *
 * Returns { valid: true } or { valid: false, error }.
 */
function verifyPaynowSignature(rawBody, timestamp, signature, secret, toleranceSeconds = 0) {
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };
  if (!signature || !timestamp) return { valid: false, error: 'Missing signature or timestamp header' };
  // Validate the format before decoding: Buffer.from(x, 'base64') silently drops bad characters
  if (!SIGNATURE_PATTERN.test(signature)) return { valid: false, error: 'Malformed signature' };

  // Optional replay protection. Off by default: Hookdeck retries and replays resend the
  // original headers, so a fixed window would reject legitimate deliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Invalid timestamp' };
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header as latin1, raw body untouched
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.', 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const provided = Buffer.from(signature, 'base64');
  // Reject non-canonical encodings (stray low bits in the last character): core compares base64 exactly
  if (provided.toString('base64') !== signature) return { valid: false, error: 'Malformed signature' };

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// Raw body for any content type, so the exact bytes are verified. Parse only after the check.
app.post('/webhooks/paynow-gg', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyPaynowSignature(
    rawBody,
    req.get('paynow-timestamp'),
    req.get('paynow-signature'),
    process.env.PAYNOW_WEBHOOK_SECRET,
    Number(process.env.PAYNOW_WEBHOOK_TOLERANCE_SECONDS) || 0
  );
  if (!result.valid) {
    console.error(`PayNow webhook rejected: ${result.error}`);
    return res.status(result.error === 'Webhook secret not configured' ? 500 : 401).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Deduplicate on event.event_id in production: PayNow retries any non-2xx response
  switch (event.event_type) {
    case 'ON_ORDER_COMPLETED':
      console.log(`Order completed: ${event.body?.id}`);
      break;
    case 'ON_PAYMENT_COMPLETED':
      console.log(`Payment completed: ${event.body?.id} (${event.body?.amount} ${event.body?.currency})`);
      break;
    case 'ON_PAYMENT_FAILED':
      console.log(`Payment failed: ${event.body?.id}`);
      break;
    case 'ON_REFUND':
      console.log(`Refund completed: ${event.body?.id}`);
      break;
    case 'ON_SUBSCRIPTION_RENEWED':
      console.log(`Subscription renewed: ${event.body?.id}`);
      break;
    case 'ON_DELIVERY_ITEM_ADDED':
      console.log(`Delivery item added: ${event.body?.id}`);
      break;
    default:
      console.log(`Unhandled PayNow event: ${event.event_type}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`PayNow webhook server listening on http://localhost:${port}/webhooks/paynow-gg`);
  });
}

module.exports = { app, verifyPaynowSignature };
