// Generated with: loop-returns-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify the X-Loop-Signature header.
 * Signature: base64(HMAC-SHA256(secret, raw request body))
 */
function verifyLoopSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

// Capture the raw body for every content type so the signature always verifies.
// Do not use express.json() on this route: re-serialized JSON won't match the signed bytes.
app.post('/webhooks/loop-returns', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-loop-signature');
  if (!signature) {
    return res.status(400).send('Missing X-Loop-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyLoopSignature(rawBody, signature, process.env.LOOP_WEBHOOK_SECRET)) {
    console.error('Loop webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The trigger (event name) is in the body, not in a header
  const { topic, trigger } = payload;
  console.log(`Received Loop ${topic} webhook: ${trigger}`);

  switch (trigger) {
    case 'return.created':
      console.log('Return created:', payload.id);
      // TODO: Notify support, sync the new return to your OMS/WMS, etc.
      break;

    case 'return.updated':
      console.log('Return updated:', payload.id, 'state:', payload.state);
      // TODO: Sync state changes (open, closed, cancelled, review, expired)
      break;

    case 'return.closed':
      console.log('Return closed:', payload.id);
      // TODO: Finalize the return in your own systems
      break;

    case 'return.processing.failed':
      console.log('Return processing failed:', payload.id);
      // TODO: Alert the team so the return can be retried or handled manually
      break;

    case 'label.created':
      console.log('Label created:', payload.id, payload.carrier, payload.tracking_number);
      // TODO: Store the tracking number, notify the customer, etc.
      break;

    case 'label.updated':
      console.log('Label updated:', payload.id, 'status:', payload.label_status);
      // TODO: Track the shipment status (in_transit, delivered, ...)
      break;

    case 'restock.requested':
      console.log('Restock requested:', payload.id);
      // TODO: Update inventory
      break;

    case 'giftcard.requested':
      console.log('Gift card requested:', payload.id);
      // TODO: Issue the gift card for the exchange
      break;

    case 'shipment.processed':
      console.log('Happy Returns shipment processed:', payload.id);
      // TODO: Update fulfillment records
      break;

    default:
      console.log(`Unhandled trigger: ${trigger}`);
  }

  // Loop expects a 2xx within 10 seconds; failures are retried (5 retries)
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLoopSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/loop-returns`);
  });
}
