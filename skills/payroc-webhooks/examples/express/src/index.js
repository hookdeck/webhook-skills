// Generated with: payroc-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Payroc does not sign payloads. Every request carries the subscription's secret as
 * plain text in the Payroc-Secret header. This authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS, dedupe on the event id, rotate on leak.
 * Node lowercases header names, so the lookup is case-insensitive.
 */
function verifyPayrocRequest(headers, secret = process.env.PAYROC_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['payroc-secret'];
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Processed event ids. Use a shared store (Redis, database) in production.
const seenIds = new Set();

function handleEvent(event) {
  switch (event.type) {
    case 'processingAccount.status.changed':
      console.log(`Processing account ${event.data?.processingAccountId} status: ${event.data?.status}`);
      // TODO: update onboarding state
      break;

    case 'processingAccount.riskStatus.changed':
      console.log(`Processing account ${event.data?.processingAccountId} risk status: ${event.data?.riskStatus}`);
      // TODO: alert risk and support teams
      break;

    case 'processingAccount.signature.signed':
      console.log(`Processing account ${event.data?.processingAccountId} signed: ${event.data?.signed}`);
      // TODO: continue onboarding
      break;

    case 'terminalOrder.status.changed':
      console.log(`Terminal order status changed: ${JSON.stringify(event.data)}`);
      // TODO: update fulfilment status
      break;

    default:
      console.log(`Unhandled event: ${event.type}`);
  }
}

// Read the body raw (any content type); authenticate before parsing.
app.post('/webhooks/payroc', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPayrocRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Payroc-Secret' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  // Retries re-send the same CloudEvent id: acknowledge without reprocessing.
  if (event.id && seenIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Payroc event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.id) seenIds.add(event.id);
  // Payroc expects exactly 200; anything else is retried five times.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPayrocRequest = verifyPayrocRequest;
module.exports.seenIds = seenIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/payroc`);
  });
}
