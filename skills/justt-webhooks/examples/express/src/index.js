// Generated with: justt-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Justt sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Justt signed, whatever the content type
app.post('/webhooks/justt', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.JUSTT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('JUSTT_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Justt webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The envelope is { type, timestamp, data }; the event name is the top-level type
  const { type, data = {} } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Justt webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'chargeback.created':
      console.log('Chargeback created:', data.chargebackId);
      break;
    case 'chargeback.updated':
      console.log('Chargeback updated:', data.chargebackId);
      break;
    case 'chargeback.status.updated':
      console.log('Chargeback status updated:', data.chargebackId, data.status);
      break;
    case 'chargeback.evidence.submitted':
      // data.status is succeeded | failed
      console.log('Chargeback evidence submitted:', data.chargebackId, data.status);
      break;
    case 'chargeback.accepted':
      // data.status is succeeded | failed
      console.log('Chargeback accepted:', data.chargebackId, data.status);
      break;
    case 'pre_chargeback_alert.received':
      console.log('Pre-chargeback alert received:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.refund.succeeded':
      console.log('Alert refund succeeded:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.refund.failed':
      console.log('Alert refund failed:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.transaction_matched':
      // Opt-in: only sent when Justt enables additional event types for your account
      console.log('Alert transaction matched:', data.internalAlertId);
      break;
    case 'subscription.cancel_immediately.success':
      console.log('Subscription cancelled:', data.subscriptionId);
      break;
    case 'subscription.cancel_immediately.failed':
      console.log('Subscription cancel failed:', data.subscriptionId, data.failureCode);
      break;
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Justt webhook server running on http://localhost:${PORT}/webhooks/justt`);
  });
}

module.exports = app;
