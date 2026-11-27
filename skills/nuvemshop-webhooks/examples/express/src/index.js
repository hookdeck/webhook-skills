// Generated with: nuvemshop-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Nuvemshop (Tiendanube) webhook signature.
 *
 * Nuvemshop signs the raw request body with HMAC-SHA256 keyed on the app's
 * client secret and sends the digest hex-encoded in x-linkedstore-hmac-sha256.
 *
 * @param {Buffer} rawBody - Raw request body (exact bytes, before JSON parsing)
 * @param {string} hmacHeader - x-linkedstore-hmac-sha256 header value
 * @param {string} clientSecret - App client secret (OAuth app secret)
 * @returns {boolean} - Whether the signature is valid
 */
function verifyNuvemshopWebhook(rawBody, hmacHeader, clientSecret) {
  if (!hmacHeader) return false;

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}

// Nuvemshop webhook endpoint - must use raw body for signature verification
app.post('/webhooks/nuvemshop',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmac = req.headers['x-linkedstore-hmac-sha256'];

    // Verify webhook signature against the raw body
    if (!verifyNuvemshopWebhook(req.body, hmac, process.env.NUVEMSHOP_CLIENT_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification. Payloads are thin:
    // { store_id, event, id } — fetch the full resource via the REST API.
    const payload = JSON.parse(req.body.toString());
    const { store_id: storeId, event, id } = payload;

    console.log(`Received ${event} for store ${storeId} (resource ${id})`);

    // Handle the event based on the resource/action event name
    switch (event) {
      case 'order/created':
        console.log('New order:', id);
        // Your code: GET /v1/{storeId}/orders/{id}, start fulfillment, etc.
        break;

      case 'order/paid':
        console.log('Order paid:', id);
        // Your code: Trigger shipping, record revenue, etc.
        break;

      case 'order/cancelled':
        console.log('Order cancelled:', id);
        // Your code: Restock, refund workflows, etc.
        break;

      case 'order/updated':
        console.log('Order updated:', id);
        // Your code: Re-sync order state, etc.
        break;

      case 'order/fulfilled':
        console.log('Order fulfilled:', id);
        // Your code: Send tracking to customer, etc.
        break;

      case 'product/created':
        console.log('New product:', id);
        // Your code: Sync to external catalog, etc.
        break;

      case 'product/updated':
        console.log('Product updated:', id);
        // Your code: Update external listings, pricing, etc.
        break;

      case 'product/deleted':
        console.log('Product deleted:', id);
        // Your code: Remove from external catalog, etc.
        break;

      case 'customer/created':
        console.log('New customer:', id);
        // Your code: CRM sync, welcome email, etc.
        break;

      case 'app/uninstalled':
        console.log('App uninstalled from store:', storeId);
        // Your code: Clean up store data, revoke tokens, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 2XX within 3 seconds to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyNuvemshopWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nuvemshop`);
  });
}
