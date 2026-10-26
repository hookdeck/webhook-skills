// Generated with: dodo-payments-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Dodo Payments sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Dodo Payments signed, whatever the content type
app.post('/webhooks/dodo-payments', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('DODO_PAYMENTS_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Dodo Payments webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The envelope is { business_id, type, timestamp, data }; data.payload_type names the resource kind
  const { type, data = {} } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Dodo Payments webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', data.payment_id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', data.payment_id);
      break;
    case 'payment.processing':
      console.log('Payment processing:', data.payment_id);
      break;
    case 'payment.cancelled':
      console.log('Payment cancelled:', data.payment_id);
      break;
    case 'refund.succeeded':
      console.log('Refund succeeded:', data.refund_id);
      break;
    case 'refund.failed':
      console.log('Refund failed:', data.refund_id);
      break;
    case 'dispute.opened':
      console.log('Dispute opened:', data.dispute_id);
      break;
    case 'dispute.won':
      console.log('Dispute won:', data.dispute_id);
      break;
    case 'dispute.lost':
      console.log('Dispute lost:', data.dispute_id);
      break;
    case 'subscription.active':
      console.log('Subscription active:', data.subscription_id);
      break;
    case 'subscription.renewed':
      console.log('Subscription renewed:', data.subscription_id);
      break;
    case 'subscription.on_hold':
      console.log('Subscription on hold:', data.subscription_id);
      break;
    case 'subscription.cancelled':
      console.log('Subscription cancelled:', data.subscription_id);
      break;
    case 'license_key.created':
      console.log('License key created:', data.payload_type);
      break;
    default:
      // Events can arrive out of order and the documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dodo Payments webhook server running on http://localhost:${PORT}/webhooks/dodo-payments`);
  });
}

module.exports = app;
