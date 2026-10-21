// Generated with: dwolla-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Dwolla signs the raw body: HMAC-SHA256, hex, keyed with the subscription secret.
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// In-memory dedupe by event ID; use a database or Redis in production.
const processedEvents = new Set();

// Raw body is required. Dwolla sends application/vnd.dwolla.v1.hal+json, so match every type.
app.post('/webhooks/dwolla', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('X-Request-Signature-SHA-256');
  if (!signature) {
    return res.status(400).send('Missing X-Request-Signature-SHA-256 header');
  }

  if (!verifySignature(req.body, signature, process.env.DWOLLA_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Duplicates must still return 2xx or Dwolla may pause the subscription.
  if (processedEvents.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);

  switch (event.topic) {
    case 'customer_created':
      console.log('Customer created:', event.resourceId);
      break;
    case 'customer_verified':
      console.log('Customer verified:', event.resourceId);
      break;
    case 'customer_funding_source_added':
      console.log('Funding source added:', event.resourceId);
      break;
    case 'customer_funding_source_verified':
      console.log('Funding source verified:', event.resourceId);
      break;
    case 'customer_transfer_created':
      console.log('Transfer created:', event.resourceId);
      break;
    case 'customer_transfer_completed':
      console.log('Transfer completed:', event.resourceId);
      break;
    case 'customer_transfer_failed':
      console.log('Transfer failed:', event.resourceId);
      break;
    case 'customer_bank_transfer_completed':
      console.log('Bank transfer completed:', event.resourceId);
      break;
    default:
      console.log('Unhandled topic:', event.topic);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Dwolla webhook server listening on port ${port}`));
}

module.exports = app;
