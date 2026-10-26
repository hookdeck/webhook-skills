// Generated with: partnero-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Partnero webhook signature.
 *
 * Partnero sends `Signature: <hex>`: the bare hex HMAC-SHA256 of the raw request body,
 * keyed with the webhook's signing secret. Nothing else is signed (no timestamp).
 */
function verifyPartneroSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  // Check the shape first (64 hex chars); hex is case-insensitive, so compare lowercased
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}

// Read the raw body for ANY content type: Partnero signs the exact bytes of PHP's json_encode
// output (escaped slashes, escaped non-ASCII), so re-serialising parsed JSON never matches.
app.post('/webhooks/partnero', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PARTNERO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PARTNERO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('Signature');

  if (!verifyPartneroSignature(rawBody, signature, secret)) {
    console.error('Partnero webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return res.status(400).send('Invalid payload');
  }

  // The event type is in the body: { event, url, webhook_key, created_at, data }
  const { event } = payload;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  switch (event) {
    case 'partner.created':
      console.log(`New partner ${data.id} (${data.email}), status ${data.status}`);
      break;
    case 'transaction.created':
      console.log(`Transaction ${data.key}: ${data.amount} ${data.currency}`);
      break;
    case 'reward.created':
    case 'reward.approved':
    case 'reward.paid':
      console.log(`${event}: reward ${data.id} (${data.amount} ${data.currency})`);
      break;
    default:
      console.log(`Unhandled Partnero event: ${event}`);
  }

  // Acknowledge within 5 seconds. Failed deliveries are retried (up to 5 attempts),
  // so dedupe on your own keys (data.id / data.key) if processing is not idempotent.
  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Partnero webhook server listening on port ${port}`));
}

module.exports = { app, verifyPartneroSignature };
