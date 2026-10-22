require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Yapily webhook signature.
 *
 * Yapily sends the lowercase hex HMAC-SHA256 of the raw body in `webhook-signature`,
 * keyed with the webhook secret as UTF-8. While a delayed secret reset is in progress it
 * also sends `webhook-rotation-signature`; either header may match.
 * This is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp.
 *
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {Array<string|undefined>} signatures - webhook-signature and webhook-rotation-signature values
 * @param {string} secret - Webhook secret from registration
 * @returns {boolean}
 */
function verifyYapilyWebhook(rawBody, signatures, secret) {
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf-8')).update(rawBody).digest('hex');
  return signatures.some((sig) => {
    if (!sig) return false;
    const received = Buffer.from(sig.trim().toLowerCase());
    const wanted = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, so check first
    return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
  });
}

// Read the raw body for any content type ('*/*') so verification never depends on Content-Type
app.post('/webhooks/yapily', express.raw({ type: '*/*' }), (req, res) => {
  const signatures = [req.headers['webhook-signature'], req.headers['webhook-rotation-signature']];

  if (!Buffer.isBuffer(req.body) || !signatures.some(Boolean)) {
    return res.status(400).send('Missing signature header');
  }

  if (!verifyYapilyWebhook(req.body, signatures, process.env.YAPILY_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf-8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { id, type, event } = payload;
  console.log(`Received ${type} (webhook: ${id}, tracingId: ${payload.metadata?.tracingId})`);

  switch (type) {
    case 'single_payment.status.completed':
      console.log(`Payment ${event?.id} completed`);
      // TODO: Mark the payment as settled in your system
      break;

    case 'single_payment.status.updated':
      console.log(`Payment ${event?.id} status: ${event?.status}`);
      // TODO: Handle COMPLETED or FAILED
      break;

    case 'single_payment.iso_status.updated':
      console.log(`Payment ${event?.id} ISO status: ${event?.statusDetails?.isoStatus?.code}`);
      // TODO: Track ISO 20022 status transitions
      break;

    case 'hosted_pis.payment_status.completed.v1':
      console.log(`Hosted payment ${event?.paymentRequestId} completed`);
      // TODO: Fulfil the order
      break;

    case 'hosted_pis.payment_status.failed.v1':
      console.log(`Hosted payment ${event?.paymentRequestId} failed`);
      // TODO: Notify the customer / offer retry
      break;

    default:
      // Other event categories (for example async data-access completion) land here
      console.log(`Unhandled event type: ${type}`);
  }

  // Yapily expects a 200 within 1 second
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyYapilyWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/yapily`);
  });
}
