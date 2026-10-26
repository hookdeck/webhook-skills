// Generated with: komoju-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a KOMOJU webhook signature.
 *
 * KOMOJU sends `X-Komoju-Signature: <hex>` (no prefix) when the webhook has a secret token: the
 * lowercase hex HMAC-SHA256 of the raw request body, keyed with that secret token. Nothing else is
 * signed (no timestamp, no id).
 */
function verifyKomojuSignature(rawBody, signatureHeader, secret) {
  // Check the exact shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Demo only: use a durable store (database, Redis) in production
const seenEventIds = new Set();

// Read the raw body for ANY content type so the exact bytes are verified before parsing.
app.post('/webhooks/komoju', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.KOMOJU_WEBHOOK_SECRET;
  if (!secret) {
    console.error('KOMOJU_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-komoju-signature'];

  if (!verifyKomojuSignature(rawBody, signature, secret)) {
    console.error('KOMOJU webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return res.status(400).send('Invalid body');
  }

  // KOMOJU retries non-2xx responses: dedupe on the event id
  if (event.id && seenEventIds.has(event.id)) {
    return res.json({ received: true, duplicate: true });
  }
  if (event.id) seenEventIds.add(event.id);

  // The body's `type` is also sent in the X-Komoju-Event header; `data` is the resource
  const data = event.data || {};
  switch (event.type) {
    case 'ping':
      console.log(`Ping from webhook ${data.id}`);
      break;
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.refunded':
    case 'payment.failed':
      console.log(`${event.type}: payment ${data.id} (${data.status}) ${data.total} ${data.currency}`);
      break;
    case 'customer.created':
      console.log(`Customer created: ${data.id}`);
      break;
    case 'subscription.created':
    case 'subscription.captured':
      console.log(`${event.type}: subscription ${data.id}`);
      break;
    default:
      console.log(`Unhandled KOMOJU event: ${event.type}`);
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`KOMOJU webhook server listening on port ${port}`));
}

module.exports = { app, verifyKomojuSignature };
