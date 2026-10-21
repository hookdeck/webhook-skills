// Generated with: yoco-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Yoco signs webhooks (Yoco API and Checkout API) with Standard Webhooks:
//   webhook-id         unique identifier for the delivery
//   webhook-timestamp  Unix seconds when the delivery was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

// Yoco recommends rejecting timestamps more than 3 minutes from now. The
// standardwebhooks SDK allows 5 minutes, so check the tighter window first.
const TIMESTAMP_TOLERANCE_SECONDS = 3 * 60;

/**
 * Verify a Yoco delivery with the Standard Webhooks SDK (the library Yoco
 * recommends). The SDK recomputes the HMAC over the raw body and compares it
 * in constant time against every `v1,` entry in webhook-signature.
 *
 * @param {Buffer|string} rawBody - the exact bytes Yoco sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the subscription secret ("whsec_...")
 * @returns {object} the parsed, verified event
 * @throws {Error} if the timestamp is stale or the signature doesn't match
 */
function verifyYocoWebhook(rawBody, headers, secret) {
  const timestamp = Number(headers['webhook-timestamp']);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new Error('Timestamp outside the 3-minute tolerance');
  }
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Yoco may deliver an event more than once and
// recommends tracking webhook-id. Use Redis or your database in production.
const processedWebhookIds = new Set();

function handleEvent(event) {
  // Yoco API events use `event_type`; Checkout API events use `type`.
  const eventType = event.event_type ?? event.type;

  switch (eventType) {
    // --- Yoco API (POS + online): flat payload with IDs --------------------
    case 'payment.created':
      // Fetch full details with GET /v1/payments/{payment_id} if you need them.
      console.log(`Payment ${event.payment_id} created for order ${event.order_id}`);
      break;
    case 'payment.refunded':
      console.log(`Payment ${event.payment_id} refunded (order ${event.order_id})`);
      break;
    case 'order.created':
    case 'order.updated':
    case 'order.completed':
    case 'order.cancelled':
      console.log(`${eventType}: order ${event.order_id} (business ${event.business_id})`);
      break;
    case 'item.created':
    case 'item.updated':
    case 'item.deleted':
    case 'item_category.created':
    case 'item_category.updated':
    case 'item_category.deleted':
      console.log(`${eventType} (business ${event.business_id})`);
      break;

    // --- Checkout API: { id, type, createdDate, payload } ------------------
    // Every account-wide payment arrives here; match payload.metadata.checkoutId
    // against the checkout you created before fulfilling anything.
    case 'payment.succeeded':
      console.log(
        `Checkout ${event.payload?.metadata?.checkoutId} paid: ` +
          `${event.payload?.amount} ${event.payload?.currency} (${event.payload?.id})`
      );
      break;
    case 'payment.failed':
      console.log(`Checkout ${event.payload?.metadata?.checkoutId} payment failed`);
      break;
    case 'refund.succeeded':
      console.log(`Refund ${event.payload?.id} succeeded: ${event.payload?.amount} cents`);
      break;
    case 'refund.failed':
      console.log(`Refund ${event.payload?.id} failed: ${event.payload?.failureReason}`);
      break;

    default:
      console.log(`Unhandled Yoco event type: ${eventType}`);
  }
}

// Yoco webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// Re-serialised JSON (express.json()) breaks signature verification.
app.post('/webhooks/yoco', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('YOCO_WEBHOOK_SECRET is not set — rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyYocoWebhook(req.body.toString('utf8'), headers, secret);
  } catch (err) {
    console.error('Yoco webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  const webhookId = headers['webhook-id'];
  if (processedWebhookIds.has(webhookId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Yoco needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedWebhookIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Yoco event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Yoco webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/yoco`);
  });
}

module.exports = { app, server, verifyYocoWebhook };
