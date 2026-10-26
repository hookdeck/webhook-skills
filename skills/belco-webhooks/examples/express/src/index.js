// Generated with: belco-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Belco webhook signature.
 *
 * Belco sends `x-hook-signature: <hex>` (no prefix): the lowercase hex HMAC-SHA256 of the raw
 * request body, keyed with the webhook's secret. Nothing else is signed.
 */
function verifyBelcoSignature(rawBody, signatureHeader, secret) {
  // Check the exact shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signatureHeader.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Demo only: use a durable store (database, Redis) in production
const seenRequestIds = new Set();

// Read the raw body for ANY content type so the exact bytes are verified before parsing.
app.post('/webhooks/belco', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BELCO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BELCO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-hook-signature'];

  if (!verifyBelcoSignature(rawBody, signature, secret)) {
    console.error('Belco webhook signature verification failed');
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

  // Belco retries non-2xx responses: dedupe on requestId
  if (event.requestId && seenRequestIds.has(event.requestId)) {
    return res.json({ received: true, duplicate: true });
  }
  if (event.requestId) seenRequestIds.add(event.requestId);

  const payload = event.payload || {};
  switch (event.eventName) {
    case 'conversation.created':
      console.log(`Conversation created: ${payload.conversation?._id} on shop ${payload.shopId}`);
      break;
    case 'conversation.replied':
      console.log(`Conversation replied: ${payload.conversation?._id}`);
      break;
    case 'conversation.assigned':
      console.log(`Conversation assigned: ${payload.conversation?._id} to ${payload.conversation?.assignedTo}`);
      break;
    case 'conversation.closed':
      console.log(`Conversation closed: ${payload.conversation?._id}`);
      break;
    case 'call.created':
    case 'call.queued':
    case 'call.answered':
    case 'call.closed':
      console.log(`${event.eventName}: ${payload.call?.direction} call, status ${payload.call?.status}`);
      break;
    default:
      console.log(`Unhandled Belco event: ${event.eventName}`);
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Belco webhook server listening on port ${port}`));
}

module.exports = { app, verifyBelcoSignature };
