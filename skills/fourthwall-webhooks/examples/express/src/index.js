require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Fourthwall shop webhook signature.
 * The header is base64(HMAC-SHA256(secret, raw body)); there is no timestamp.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - X-Fourthwall-Hmac-SHA256 header value
 * @param {string} secret - Shop secret key (used as UTF-8 text)
 * @returns {boolean} - Whether signature is valid
 */
function verifyFourthwallSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}

// Fourthwall webhook endpoint - must use the raw body for signature verification.
// type: '*/*' makes the body a Buffer whatever Content-Type is sent.
app.post('/webhooks/fourthwall',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.get('X-Fourthwall-Hmac-SHA256');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Verify webhook signature
    if (!verifyFourthwallSignature(rawBody, signature, process.env.FOURTHWALL_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const data = event.data || {};
    console.log(`Received ${event.type} (${event.id})${event.testMode ? ' [test]' : ''}`);

    // Handle the event based on type. Delivery is at-least-once,
    // so deduplicate on event.id before doing real work.
    switch (event.type) {
      case 'ORDER_PLACED':
        console.log('New order:', data.friendlyId);
        // TODO: Start fulfilment, record the sale, etc.
        break;

      case 'ORDER_UPDATED':
        console.log('Order updated:', data.order && data.order.friendlyId);
        // TODO: Sync order status or shipping address
        break;

      case 'GIFT_PURCHASE':
        console.log('Gift purchase:', data.friendlyId);
        // TODO: Deliver or track gift redemptions
        break;

      case 'DONATION':
        console.log('Donation from:', data.username);
        // TODO: Send thanks, trigger a stream alert, etc.
        break;

      case 'SUBSCRIPTION_PURCHASED':
        console.log('New subscription:', data.id);
        // TODO: Grant membership access
        break;

      case 'SUBSCRIPTION_CHANGED':
        console.log('Subscription changed:', data.id);
        // TODO: Update entitlements for the new tier
        break;

      case 'SUBSCRIPTION_EXPIRED':
        console.log('Subscription expired:', data.id);
        // TODO: Revoke membership access
        break;

      case 'PRODUCT_CREATED':
        console.log('Product created:', data.name);
        // TODO: Add to external catalog
        break;

      case 'PRODUCT_UPDATED':
        console.log('Product updated:', data.name);
        // TODO: Update external catalog
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 quickly (Fourthwall expects a reply within 2 seconds)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFourthwallSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fourthwall`);
  });
}
