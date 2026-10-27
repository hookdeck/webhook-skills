// Generated with: terminal49-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Terminal49 signs the raw request body with HMAC-SHA256, keyed with the webhook's `secret`
 * (UTF-8 bytes, used as-is), and sends the bare hex digest in X-T49-Webhook-Signature.
 * No timestamp is signed, so there is no replay window to check.
 */
function verifyTerminal49Signature(rawBody, signature, secret = process.env.TERMINAL49_WEBHOOK_SECRET) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false; // never accept when unconfigured
  // Validate the format first: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
const processedNotificationIds = new Set();

function handleNotification(payload) {
  const { data, included = [] } = payload;
  const event = data.attributes.event; // data.type is always "webhook_notification"
  const referenceType = data.relationships?.reference_object?.data?.type;

  switch (event) {
    case 'tracking_request.succeeded':
    case 'tracking_request.failed': {
      const request = included.find((r) => r.type === 'tracking_request');
      console.log(`${event} (${referenceType}) ${request?.attributes?.request_number ?? ''}`);
      // TODO: mark the tracking request done, or surface request.attributes.failed_reason
      break;
    }

    case 'container.transport.vessel_arrived':
    case 'container.transport.vessel_departed':
    case 'container.transport.available': {
      const container = included.find((r) => r.type === 'container');
      console.log(`${event} for container ${container?.attributes?.number}`);
      // TODO: update your container milestone from the transport_event in `included`
      break;
    }

    case 'container.updated':
    case 'shipment.estimated.arrival':
      console.log(`${event} (${referenceType})`);
      // TODO: re-fetch the container or shipment from the REST API for the latest ETA/state
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.post('/webhooks/terminal49', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-t49-webhook-signature'];
  if (!verifyTerminal49Signature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid or missing X-T49-Webhook-Signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const data = payload && payload.data;
  if (!data || typeof data.attributes?.event !== 'string') {
    return res.status(400).json({ error: 'Expected data.attributes.event' });
  }

  // Retries can deliver the same notification more than once: data.id is the idempotency key.
  if (data.id && processedNotificationIds.has(data.id)) {
    console.log(`Duplicate notification ${data.id}, skipping`);
    return res.status(200).json({ received: true });
  }

  try {
    handleNotification(payload);
    if (data.id) processedNotificationIds.add(data.id);
  } catch (err) {
    console.error('Error handling Terminal49 notification:', err);
    return res.status(500).json({ error: 'Handler error' }); // Terminal49 retries non-2xx (up to 12 times)
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTerminal49Signature = verifyTerminal49Signature;
module.exports.processedNotificationIds = processedNotificationIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/terminal49`);
  });
}
