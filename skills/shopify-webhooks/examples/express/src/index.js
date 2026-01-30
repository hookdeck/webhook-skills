require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Shopify webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} hmacHeader - X-Shopify-Hmac-SHA256 header value
 * @param {string} secret - Shopify API secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

// Shopify webhook endpoint - must use raw body for signature verification
app.post('/webhooks/shopify',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];
    const shop = req.headers['x-shopify-shop-domain'];

    // Verify webhook signature
    if (!hmac || !verifyShopifyWebhook(req.body, hmac, process.env.SHOPIFY_API_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());

    console.log(`Received ${topic} webhook from ${shop}`);

    // Handle the event based on topic
    switch (topic) {
      case 'orders/create':
        console.log('New order:', payload.id);
        // TODO: Process new order, sync to fulfillment, etc.
        break;

      case 'orders/updated':
        console.log('Order updated:', payload.id);
        // TODO: Update order status, sync changes, etc.
        break;

      case 'orders/paid':
        console.log('Order paid:', payload.id);
        // TODO: Trigger fulfillment, record payment, etc.
        break;

      case 'products/create':
        console.log('New product:', payload.id);
        // TODO: Sync to external catalog, etc.
        break;

      case 'products/update':
        console.log('Product updated:', payload.id);
        // TODO: Update external listings, etc.
        break;

      case 'customers/create':
        console.log('New customer:', payload.id);
        // TODO: Welcome email, CRM sync, etc.
        break;

      case 'app/uninstalled':
        console.log('App uninstalled from shop:', shop);
        // TODO: Cleanup shop data, etc.
        break;

      // GDPR mandatory webhooks
      case 'customers/data_request':
        console.log('Customer data request for shop:', shop);
        // TODO: Gather and return customer data
        break;

      case 'customers/redact':
        console.log('Customer redact request for shop:', shop);
        // TODO: Delete customer data
        break;

      case 'shop/redact':
        console.log('Shop redact request for shop:', shop);
        // TODO: Delete all shop data
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/shopify`);
});
