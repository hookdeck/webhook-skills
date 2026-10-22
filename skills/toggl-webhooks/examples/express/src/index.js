// Generated with: toggl-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Toggl Track webhook signature.
 *
 * Toggl sends `X-Webhook-Signature-256: sha256=<hex>` where <hex> is the
 * HMAC-SHA256 of the full, unparsed request body keyed with the subscription secret.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - X-Webhook-Signature-256 header value
 * @param {string} secret - Subscription secret
 * @returns {boolean}
 */
function verifyTogglWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

// express.raw({ type: '*/*' }) keeps the exact bytes for any content type.
app.post('/webhooks/toggl', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-webhook-signature-256'];

  if (!signature) {
    return res.status(400).send('Missing X-Webhook-Signature-256 header');
  }
  if (!verifyTogglWebhook(req.body, signature, process.env.TOGGL_WEBHOOK_SECRET)) {
    console.error('Toggl webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // PING events: payload is the string "ping". For subscriptions that are not
  // yet validated, they include validation_code — echo it to validate.
  if (event.payload === 'ping') {
    console.log(`Toggl PING for subscription ${event.subscription_id}`);
    if (event.validation_code) {
      return res.status(200).json({ validation_code: event.validation_code });
    }
    return res.status(200).json({ received: true });
  }

  const model = event.metadata?.model;
  const action = event.metadata?.action;
  const eventType = `${model}.${action}`;

  switch (eventType) {
    case 'time_entry.created':
      console.log('Time entry created:', event.payload?.description);
      // TODO: sync to billing, notify, etc.
      break;
    case 'time_entry.updated':
      console.log('Time entry updated:', event.payload?.id);
      break;
    case 'time_entry.deleted':
      console.log('Time entry deleted:', event.payload?.id ?? event.metadata?.model_id);
      break;
    case 'project.created':
      console.log('Project created:', event.payload?.name);
      break;
    case 'project.updated':
      console.log('Project updated:', event.payload?.name);
      break;
    case 'project.deleted':
      console.log('Project deleted:', event.payload?.id ?? event.metadata?.model_id);
      break;
    default:
      console.log(`Unhandled Toggl event: ${eventType}`);
  }

  // Any 2xx acknowledges delivery; non-2xx triggers a later retry
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = { app, verifyTogglWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/toggl`);
  });
}
