// Generated with: doubleword-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook, WebhookVerificationError } = require('standardwebhooks');

const app = express();

// A whsec_ secret is base64-decoded after the prefix (the library does this).
// Any other secret is used as its raw UTF-8 bytes, matching Hookdeck.
function createWebhook(secret) {
  if (secret.startsWith('whsec_')) return new Webhook(secret);
  return new Webhook(new TextEncoder().encode(secret), { format: 'raw' });
}

// Doubleword follows Standard Webhooks: HMAC-SHA256 (base64) over
// `{webhook-id}.{webhook-timestamp}.{raw body}`. The standardwebhooks library
// reads the webhook-* header names; Hookdeck-style deliveries may carry svix-*
// instead, so remap whichever set is present.
function standardHeaders(req) {
  const prefix = req.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': req.get(`${prefix}-id`) || '',
    'webhook-timestamp': req.get(`${prefix}-timestamp`) || '',
    'webhook-signature': req.get(`${prefix}-signature`) || '',
  };
}

// express.raw with '*/*' keeps the exact bytes for any content type.
app.post('/webhooks/doubleword', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DOUBLEWORD_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverified deliveries.
    console.error('DOUBLEWORD_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const headers = standardHeaders(req);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).send('Missing webhook signature headers');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  try {
    // verify() also enforces a fixed 5-minute timestamp window.
    createWebhook(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('Webhook signature verification failed:', err.message);
    }
    return res.status(400).send('Invalid signature');
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const data = event.data || {};
  switch (event.type) {
    case 'batch.completed':
      console.log(`Batch ${data.batch_id} completed:`, data.request_counts);
      // TODO: download results with the files API using data.output_file_id
      // (and data.error_file_id for individual failed requests)
      break;

    case 'batch.failed':
      console.log(`Batch ${data.batch_id} failed:`, data.request_counts);
      // TODO: alert, then inspect data.error_file_id
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Any 2xx acknowledges. Repeated non-2xx responses disable the webhook.
  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/doubleword`);
  });
}
