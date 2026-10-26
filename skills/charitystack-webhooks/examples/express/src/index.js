// Generated with: charitystack-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PREFIX = 'sha256=';
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Optional replay window in seconds. Off by default (unset or 0): Hookdeck
 * retries and replays resend the original headers, so a fixed window would
 * reject legitimate deliveries.
 */
function toleranceFromEnv() {
  const value = Number(process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Verify a CharityStack webhook signature.
 *
 * Header:         X-Webhook-Signature: sha256=<hex> (bare hex is accepted too)
 * Signed content: `${X-Webhook-Timestamp}.` + raw body bytes
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
 */
function verifyCharityStackSignature(
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
  toleranceSeconds = 0,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Webhook-Signature header' };
  }
  if (!timestampHeader) {
    return { valid: false, error: 'Missing X-Webhook-Timestamp header' };
  }

  const digest = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : signatureHeader;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') silently
  // drops bad characters.
  if (!HEX_SHA256.test(digest)) {
    return { valid: false, error: 'Malformed X-Webhook-Signature header' };
  }

  if (toleranceSeconds > 0) {
    // Unix seconds. Checked only when the opt-in tolerance is set.
    if (!/^[0-9]+$/.test(timestampHeader)) {
      return { valid: false, error: 'Malformed X-Webhook-Timestamp header' };
    }
    if (Math.abs(nowSeconds - Number(timestampHeader)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header value as latin1, raw body untouched.
  const signedContent = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedContent)
    .digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');

  return crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}

function handleEvent(event, deliveryId) {
  switch (event.type) {
    case 'donation.created':
      console.log(`New donation received (delivery ${deliveryId})`);
      break;
    case 'donation.updated':
      console.log(`Donation status changed (delivery ${deliveryId})`);
      break;
    case 'subscription.created':
      console.log(`Recurring subscription started (delivery ${deliveryId})`);
      break;
    case 'subscription.updated':
      // Also fires alongside subscription.payment_method_updated.
      console.log(`Subscription modified (delivery ${deliveryId})`);
      break;
    case 'subscription.cancelled':
      console.log(`Subscription cancelled (delivery ${deliveryId})`);
      break;
    case 'subscription.payment_method_updated':
      console.log(`Subscription payment method updated (delivery ${deliveryId})`);
      break;
    case 'contact.created':
    case 'contact.updated':
      console.log(`${event.type} (delivery ${deliveryId})`);
      break;
    default:
      // form.created, form.updated and any future types: log and acknowledge.
      console.log(`Unhandled CharityStack event type: ${event.type}`);
  }
}

// CharityStack webhook endpoint. express.raw with '*/*' keeps the exact bytes
// that were signed, whatever the content type.
app.post('/webhooks/charitystack', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CHARITYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHARITYSTACK_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const verification = verifyCharityStackSignature(
    rawBody,
    req.get('x-webhook-signature'),
    req.get('x-webhook-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!verification.valid) {
    console.error('CharityStack webhook verification failed:', verification.error);
    return res.status(401).json({ error: verification.error });
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // In production: persist the event, return 2xx, then process asynchronously.
  handleEvent(event, req.get('x-webhook-id'));

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCharityStackSignature = verifyCharityStackSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/charitystack`);
  });
}
