// Generated with: monerium-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Monerium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Monerium signed, whatever the content type
app.post('/webhooks/monerium', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MONERIUM_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('MONERIUM_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    console.error('Monerium webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (typeof event !== 'object' || event === null) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Every body is { type, data }: the event name is the dotted top-level `type`
  const { type } = event;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries: use it to deduplicate
  console.log(`Received Monerium webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'order.created':
      // Incoming payment detected (kind 'issue') before it is processed
      console.log('Order created:', data.id, data.kind, data.amount, data.currency, data.chain);
      break;
    case 'order.updated':
      if (data.state === 'processed') {
        // meta.txHashes holds the on-chain transaction hashes
        console.log('Order processed:', data.id, data.meta?.txHashes);
      } else if (data.state === 'rejected') {
        // meta.rejectedReason explains why
        console.error('Order rejected:', data.id, data.meta?.rejectedReason);
      } else {
        console.log('Order updated:', data.id, data.state);
      }
      break;
    case 'subscription.created':
      // Sent right after you register the webhook: answering 200 activates the subscription
      console.log('Subscription created: webhook activated');
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Monerium webhook server running on http://localhost:${PORT}/webhooks/monerium`);
  });
}

module.exports = app;
