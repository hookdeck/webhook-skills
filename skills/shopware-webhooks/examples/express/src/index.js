require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Look up the app secret for a shop. Each shop has its own secret, assigned
 * during the registration handshake. Replace with a database lookup in production.
 */
function getShopSecret(shopId) {
  try {
    const secrets = JSON.parse(process.env.SHOPWARE_APP_SECRETS || '{}');
    if (secrets[shopId]) return secrets[shopId];
  } catch {
    // fall through to the single-secret fallback
  }
  return process.env.SHOPWARE_APP_SECRET || null;
}

/**
 * Verify Shopware webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - shopware-shop-signature header value (hex)
 * @param {string} secret - App secret for the shop
 * @returns {boolean} - Whether signature is valid
 */
function verifyShopwareWebhook(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  // HMAC-SHA256 of the raw body, hex encoded
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// Shopware webhook endpoint - must use raw body for signature verification.
// '*/*' makes every content type verify against the exact bytes received.
app.post('/webhooks/shopware',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      return res.status(400).send('Missing body');
    }

    // Parse only to find which shop sent this; nothing is trusted until verified
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    const shopId = payload && payload.source && payload.source.shopId;
    if (!shopId) {
      return res.status(400).send('Missing source.shopId');
    }

    const signature = req.headers['shopware-shop-signature'];
    if (!verifyShopwareWebhook(rawBody, signature, getShopSecret(shopId))) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const event = payload.data && payload.data.event;
    const eventId = payload.source.eventId; // stable across retries: use for idempotency
    console.log(`Received ${event} event from shop ${shopId} (eventId: ${eventId})`);

    switch (event) {
      case 'checkout.order.placed':
        console.log('Order placed:', JSON.stringify(payload.data.payload));
        // TODO: Fulfilment, ERP sync, etc.
        break;

      case 'product.written':
        console.log('Product written:', JSON.stringify(payload.data.payload));
        // TODO: Fetch the product by primaryKey via the Admin API and sync it
        break;

      case 'order.written':
        console.log('Order written:', JSON.stringify(payload.data.payload));
        // TODO: Fetch the order by primaryKey and sync it
        break;

      case 'customer.written':
        console.log('Customer written:', JSON.stringify(payload.data.payload));
        // TODO: Fetch the customer by primaryKey and sync to CRM
        break;

      case 'state_enter.order.state.completed':
        console.log('Order completed:', JSON.stringify(payload.data.payload));
        // TODO: Send notifications, invoicing, etc.
        break;

      case 'state_enter.order_transaction.state.paid':
        console.log('Order transaction paid:', JSON.stringify(payload.data.payload));
        // TODO: Release goods, mark as paid, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyShopwareWebhook, getShopSecret };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shopware`);
  });
}
