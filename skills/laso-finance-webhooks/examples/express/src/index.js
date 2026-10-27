// Generated with: laso-finance-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Laso Finance sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Laso Finance signed, whatever the content type
app.post('/webhooks/laso-finance', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LASO_FINANCE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LASO_FINANCE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Laso Finance webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The envelope is { type, timestamp, data }; data is { user_id, title, text, category }
  const { type, data = {} } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Laso Finance webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'notification.account':
      console.log('Account:', data.title);
      break;
    case 'notification.transaction':
      console.log('Transaction:', data.title);
      break;
    case 'notification.deposit':
      console.log('Deposit:', data.title);
      break;
    case 'notification.withdrawal':
      console.log('Withdrawal:', data.title);
      break;
    case 'notification.card':
      console.log('Card:', data.title);
      break;
    case 'notification.giftCard':
      console.log('Gift card:', data.title);
      break;
    case 'notification.refund':
      console.log('Refund:', data.title);
      break;
    case 'notification.balanceUpdate':
      console.log('Balance update:', data.title);
      break;
    default:
      // The category list is open-ended ("Categories include ..."): ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Laso Finance webhook server running on http://localhost:${PORT}/webhooks/laso-finance`);
  });
}

module.exports = app;
