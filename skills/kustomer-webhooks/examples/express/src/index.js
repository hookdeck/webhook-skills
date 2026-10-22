// Generated with: kustomer-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Kustomer signs the raw body: hex HMAC-SHA256 keyed with the webhook token.
function verifyKustomerSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Naive in-memory dedupe on the event id; use a shared store in production.
const seen = new Set();

// express.raw with '*/*' keeps the body as bytes whatever the content type is.
app.post('/webhooks/kustomer', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-kustomer-webhook-signature');
  if (!signature) {
    return res.status(400).send('Missing X-Kustomer-Webhook-Signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyKustomerSignature(req.body, signature, process.env.KUSTOMER_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (event.id && seen.has(event.id)) {
    return res.json({ received: true, duplicate: true });
  }
  if (event.id) seen.add(event.id);

  // The event type is the "name" field in the body.
  switch (event.name) {
    case 'kustomer.conversation.create':
      console.log('Conversation created:', event.data?.id);
      break;
    case 'kustomer.conversation.update':
      console.log('Conversation updated:', event.data?.id);
      break;
    case 'kustomer.customer.create':
      console.log('Customer created:', event.data?.id);
      break;
    case 'kustomer.customer.update':
      console.log('Customer updated:', event.data?.id);
      break;
    case 'kustomer.message.create':
      console.log('Message created:', event.data?.id);
      break;
    case 'kustomer.message.update':
      console.log('Message updated:', event.data?.id);
      break;
    default:
      console.log('Unhandled event:', event.name);
  }

  // Respond 2xx quickly: Kustomer disables the webhook after 10 consecutive failures.
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Kustomer webhook server listening on port ${PORT}`));
}

module.exports = app;
