// Generated with: commercelayer-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Commerce Layer webhook signature.
 *
 * Commerce Layer signs the RAW request body with HMAC-SHA256 keyed on the
 * webhook's shared_secret and sends the digest as base64 in the
 * X-CommerceLayer-Signature header.
 *
 * @param {Buffer} rawBody - Raw request body (do NOT JSON.parse before verifying)
 * @param {string} signature - X-CommerceLayer-Signature header value
 * @param {string} sharedSecret - The webhook's shared_secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyCommerceLayerSignature(rawBody, signature, sharedSecret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', sharedSecret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffers of different length throw — treat as invalid.
    return false;
  }
}

// Commerce Layer webhook endpoint.
// express.raw() gives us the untouched body needed for signature verification.
app.post(
  '/webhooks/commercelayer',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-commercelayer-signature'];
    const topic = req.headers['x-commercelayer-topic'];

    // Verify first — reject anything that isn't authentic.
    if (!verifyCommerceLayerSignature(req.body, signature, process.env.COMMERCELAYER_SHARED_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Safe to parse only after verification. Payload is JSON:API.
    const payload = JSON.parse(req.body.toString());
    const resource = payload.data;

    console.log(`Received ${topic} webhook for ${resource?.type} ${resource?.id}`);

    // Dispatch on the topic ({resource}.{trigger}).
    switch (topic) {
      case 'orders.place':
        console.log('Order placed:', resource?.id);
        // Your code: Start fulfillment, notify ops, etc.
        break;

      case 'orders.approve':
        console.log('Order approved:', resource?.id);
        // Your code: Trigger downstream processing.
        break;

      case 'orders.cancel':
        console.log('Order cancelled:', resource?.id);
        // Your code: Release stock, reverse workflows.
        break;

      case 'orders.pay':
        console.log('Order paid:', resource?.id);
        // Your code: Record revenue, kick off fulfillment.
        break;

      case 'orders.refund':
        console.log('Order refunded:', resource?.id);
        // Your code: Update accounting, notify customer.
        break;

      case 'customers.create':
        console.log('Customer created:', resource?.id);
        // Your code: CRM sync, welcome email.
        break;

      case 'shipments.ship':
        console.log('Shipment shipped:', resource?.id);
        // Your code: Send tracking, update order status.
        break;

      case 'shipments.deliver':
        console.log('Shipment delivered:', resource?.id);
        // Your code: Close order, request a review.
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    // Acknowledge quickly (Commerce Layer requires a 2xx within 5 seconds).
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyCommerceLayerSignature };

// Start the server only when run directly (not when imported by tests).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/commercelayer`);
  });
}
