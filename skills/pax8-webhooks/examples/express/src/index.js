// Generated with: pax8-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Pax8 does not sign payloads. It sends the `authorization` value you set on the webhook
 * back in the `Authorization` header exactly as entered. Compare the WHOLE header value,
 * including any "Bearer " or "Basic " prefix: don't strip, parse or base64-decode it.
 * This authenticates the sender only; it gives no body integrity or replay protection.
 */
function verifyPax8Request(headers, config = process.env) {
  const expected = config.PAX8_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Pax8's Webhooks API reference types a delivery as WebhookPayload: accountId, url,
 * webhookId, sentAt, webhookTopic ({ id, topic, filters }) and payloadData. The topic
 * name is webhookTopic.topic. payloadData varies by topic and isn't documented, so treat
 * the notification as a prompt to fetch current state from the Pax8 API.
 */
function classify(payload) {
  const wt = payload.webhookTopic;
  const topic = wt && typeof wt.topic === 'string' && wt.topic ? wt.topic.toUpperCase() : null;
  const sentAt = typeof payload.sentAt === 'string' ? payload.sentAt : null;
  return { topic, sentAt };
}

function handleEvent(payload) {
  const { topic, sentAt } = classify(payload);

  // SUBSCRIPTION, INVOICE and PRODUCT are topic values printed in Pax8's docs. Read the
  // client, quote and user topic strings from GET /webhooks/topic-definitions.
  switch (topic) {
    case 'SUBSCRIPTION':
      console.log(`Pax8 subscription notification sent at ${sentAt}`);
      // Fetch the subscription from the Pax8 API and update your system.
      break;

    case 'INVOICE':
      console.log(`Pax8 invoice notification sent at ${sentAt}`);
      // Fetch the invoice from the Pax8 API and import it into billing.
      break;

    case 'PRODUCT':
      console.log(`Pax8 product notification sent at ${sentAt}`);
      // Refresh the product in your catalog cache.
      break;

    default:
      console.log(`Pax8 notification for topic ${topic ?? '(none)'}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Pax8 uses.
app.post('/webhooks/pax8', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPax8Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Pax8 webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Pax8 marks a delivery failed after 10 seconds: acknowledge quickly.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPax8Request = verifyPax8Request;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pax8`);
  });
}
