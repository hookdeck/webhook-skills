require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Webhook IDs we have already processed. Use a database or Redis in production.
const processedWebhooks = new Set();

/**
 * Verify the X-Signature header: lowercase hex HMAC-SHA256 of the RAW request
 * body, keyed with the webhook key as a plain UTF-8 string.
 */
function verifySignature(rawBody, signature, webhookKey) {
  if (!signature || !webhookKey) return false;

  const expected = crypto
    .createHmac('sha256', webhookKey)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signature.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws when lengths differ, so check first
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}

// Dispatch on "<topic>.<event>": the topic comes from the X-Topic header and
// the event name from the body's `event` field.
function handleEvent(topic, event, data) {
  switch (`${topic}.${event}`) {
    case 'payment_order.created':
    case 'payment_order.approved':
    case 'payment_order.begin_processing':
    case 'payment_order.finish_processing':
      console.log(`Payment order ${data.id} is ${event}`);
      break;
    case 'payment_order.completed':
      console.log(`Payment order ${data.id} completed (funds accepted by the bank)`);
      break;
    case 'payment_order.reconciled':
      console.log(`Payment order ${data.id} reconciled (settled)`);
      break;
    case 'payment_order.failed':
    case 'payment_order.returned':
      console.log(`Payment order ${data.id} ${event}`, data.status);
      break;
    case 'expected_payment.reconciled':
    case 'expected_payment.partially_reconciled':
    case 'expected_payment.overdue':
      console.log(`Expected payment ${data.id} ${event}`);
      break;
    case 'incoming_payment_detail.completed':
    case 'incoming_payment_detail.reconciled':
      console.log(`Incoming payment ${data.id} ${event}`);
      break;
    case 'transaction.created':
    case 'transaction.reconciled':
      console.log(`Transaction ${data.id} ${event}`);
      break;
    case 'return.created':
    case 'return.completed':
    case 'reversal.completed':
      console.log(`${topic} ${data.id} ${event}`);
      break;
    default:
      console.log(`Unhandled event: ${topic}.${event}`);
  }
}

// Use the raw body: the signature is computed over the exact bytes sent.
// '*/*' makes sure the body is a Buffer whatever Content-Type arrives.
app.post('/webhooks/modern-treasury', express.raw({ type: '*/*' }), (req, res) => {
  const webhookKey = process.env.MODERN_TREASURY_WEBHOOK_KEY;
  if (!webhookKey) {
    console.error('MODERN_TREASURY_WEBHOOK_KEY is not set');
    return res.status(500).send('Webhook key not configured');
  }

  // Node lowercases incoming header names; req.headers['X-Signature'] is always undefined.
  const signature = req.headers['x-signature'];
  if (!signature) {
    return res.status(400).send('Missing X-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(rawBody, signature, webhookKey)) {
    console.error('Modern Treasury signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const topic = req.headers['x-topic'];
  const webhookId = req.headers['x-webhook-id'];

  // X-Webhook-ID stays the same across retries of one webhook
  if (webhookId && processedWebhooks.has(webhookId)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(topic, payload.event, payload.data || {});
    if (webhookId) processedWebhooks.add(webhookId);
    return res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook:', err);
    return res.status(500).send('Handler error');
  }
});

module.exports = { app, verifySignature };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/modern-treasury`);
  });
}
