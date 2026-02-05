const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify WooCommerce webhook signature using HMAC SHA-256
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - X-WC-Webhook-Signature header value
 * @param {string} secret - Webhook secret from WooCommerce
 * @returns {boolean} - True if signature is valid
 */
function verifyWooCommerceWebhook(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Different lengths will cause an error
    return false;
  }
}

/**
 * Handle different WooCommerce event types
 * @param {string} topic - Event topic (e.g., "order.created")
 * @param {Object} payload - Webhook payload
 */
function handleWooCommerceEvent(topic, payload) {
  console.log(`Processing ${topic} event for ID: ${payload.id}`);
  
  switch (topic) {
    case 'order.created':
      console.log(`New order #${payload.id} for $${payload.total}`);
      // Add your order processing logic here
      break;
      
    case 'order.updated':
      console.log(`Order #${payload.id} updated to status: ${payload.status}`);
      // Add your order update logic here
      break;
      
    case 'product.created':
      console.log(`New product: ${payload.name} (ID: ${payload.id})`);
      // Add your product sync logic here
      break;
      
    case 'product.updated':
      console.log(`Product updated: ${payload.name} (ID: ${payload.id})`);
      // Add your product update logic here
      break;
      
    case 'customer.created':
      console.log(`New customer: ${payload.email} (ID: ${payload.id})`);
      // Add your customer onboarding logic here
      break;
      
    case 'customer.updated':
      console.log(`Customer updated: ${payload.email} (ID: ${payload.id})`);
      // Add your customer update logic here
      break;
      
    default:
      console.log(`Unhandled event type: ${topic}`);
  }
}

// CRITICAL: Use raw body parser for signature verification
app.use('/webhooks/woocommerce', express.raw({ type: 'application/json' }));

// WooCommerce webhook endpoint
app.post('/webhooks/woocommerce', (req, res) => {
  try {
    const signature = req.headers['x-wc-webhook-signature'];
    const topic = req.headers['x-wc-webhook-topic'];
    const source = req.headers['x-wc-webhook-source'];
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    
    console.log(`Received webhook: ${topic} from ${source}`);
    
    // Verify webhook signature
    if (!verifyWooCommerceWebhook(req.body, signature, secret)) {
      console.log('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Signature verified');
    
    // Parse the JSON payload
    const payload = JSON.parse(req.body.toString());
    
    // Handle the event
    handleWooCommerceEvent(topic, payload);
    
    // Respond with success
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WooCommerce webhook server running on port ${PORT}`);
  console.log(`📍 Webhook endpoint: http://localhost:${PORT}/webhooks/woocommerce`);
  console.log('🔒 Make sure to set WOOCOMMERCE_WEBHOOK_SECRET in your environment');
});

module.exports = { app, verifyWooCommerceWebhook };