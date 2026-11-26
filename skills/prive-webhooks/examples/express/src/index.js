// Generated with: prive-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Every payload is {topic, idempotencyKey, data}, so the body names its topic.
// Each webhook also subscribes to one topic, so a path per topic works as a
// second check. Map path slug -> topic.
const TOPICS = {
  'subscriptions-created': 'subscriptions/created',
  'subscriptions-line-removed': 'subscriptions/line_removed',
  'subscriptions-status-updated': 'subscriptions/status/updated',
  'orders-created': 'orders/created',
  'billing-attempts-created': 'billingAttempts/created',
  'billing-attempts-success': 'billingAttempts/success',
  'billing-attempts-failed': 'billingAttempts/failed',
  'payment-method-updated': 'paymentMethod/updated',
  'subscription-activities-created': 'subscriptionActivities/created',
  'subscription-custom-attributes-updated': 'subscription/customAttributes/updated',
};

/**
 * Verify a Prive webhook.
 *
 * `x-prive-hmac-sha256` is the bare base64 HMAC-SHA256 of the raw body, keyed
 * with the secret token Prive provides to the merchant. Compare the base64
 * strings as equal-length UTF-8 buffers (no lenient base64 decoding).
 *
 * @param {Buffer} rawBody - Raw request body (not parsed JSON)
 * @param {string} header - x-prive-hmac-sha256 header value
 * @param {string} secret - Prive secret token
 * @returns {boolean}
 */
function verifyPriveSignature(rawBody, header, secret) {
  if (!header || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch, so check first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleEvent(topic, payload) {
  switch (topic) {
    case 'subscriptions/created':
      console.log('Subscription created:', payload?.data?.id);
      break;
    case 'subscriptions/line_removed':
      console.log('Subscription line removed:', payload?.data?.id);
      break;
    case 'subscriptions/status/updated':
      console.log('Subscription status updated:', payload?.data?.id);
      break;
    case 'orders/created':
      console.log('Order created:', payload?.data?.id);
      break;
    case 'billingAttempts/created':
      console.log('Billing attempt created:', payload?.data?.id);
      break;
    case 'billingAttempts/success':
      console.log('Billing attempt succeeded:', payload?.data?.id);
      break;
    case 'billingAttempts/failed':
      console.log('Billing attempt failed:', payload?.data?.id);
      break;
    case 'paymentMethod/updated':
      console.log('Payment method updated:', payload?.data?.id);
      break;
    case 'subscriptionActivities/created':
      console.log('Subscription activity created:', payload?.data?.id);
      break;
    case 'subscription/customAttributes/updated':
      console.log('Subscription custom attributes updated:', payload?.data?.id);
      break;
    default:
      console.log('Unhandled topic:', topic);
  }
}

// Read the raw body for any content type so the signature always verifies
const rawBody = express.raw({ type: '*/*' });

function receive(topicFor) {
  return (req, res) => {
    const topic = topicFor(req);
    if (topic === null) return res.status(404).send('Unknown topic');

    // 1. Verify first, using the raw body
    const secret = process.env.PRIVE_WEBHOOK_SECRET;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyPriveSignature(body, req.headers['x-prive-hmac-sha256'], secret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // 2. Parse only after verification
    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // 3. Dispatch on the body's topic; a per-topic path must agree with it
    const bodyTopic = payload?.topic;
    if (topic && bodyTopic && bodyTopic !== topic) {
      return res.status(400).send('Topic does not match path');
    }
    handleEvent(bodyTopic ?? topic, payload);

    // Acknowledge quickly; do slow work asynchronously
    res.status(200).send('OK');
  };
}

// Generic endpoint (topic unknown) - used by the Hookdeck CLI default path
app.post('/webhooks/prive', rawBody, receive(() => undefined));

// One endpoint per topic: /webhooks/prive/billing-attempts-failed, etc.
app.post(
  '/webhooks/prive/:topic',
  rawBody,
  receive((req) => (TOPICS[req.params.topic] ?? null))
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyPriveSignature, TOPICS };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/prive/:topic`);
  });
}
