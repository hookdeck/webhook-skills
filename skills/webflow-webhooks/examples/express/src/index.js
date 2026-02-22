const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

/**
 * Verify Webflow webhook signature
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signature - x-webflow-signature header
 * @param {string} timestamp - x-webflow-timestamp header
 * @param {string} secret - Webhook signing secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyWebflowSignature(rawBody, signature, timestamp, secret) {
  // Validate timestamp to prevent replay attacks (5-minute window)
  const currentTime = Date.now();
  const webhookTime = parseInt(timestamp);

  if (isNaN(webhookTime)) {
    return false;
  }

  const timeDiff = Math.abs(currentTime - webhookTime);
  if (timeDiff > 300000) { // 5 minutes = 300000 milliseconds
    return false;
  }

  // Create signed content: timestamp:body
  const signedContent = `${timestamp}:${rawBody.toString()}`;

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Different lengths = invalid
    return false;
  }
}

// Webhook endpoint with raw body parsing
app.post('/webhooks/webflow', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-webflow-signature'];
  const timestamp = req.headers['x-webflow-timestamp'];

  // Check required headers
  if (!signature || !timestamp) {
    console.error('Missing required headers');
    return res.status(400).send('Missing required headers');
  }

  // Verify signature
  const secret = process.env.WEBFLOW_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WEBFLOW_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  const isValid = verifyWebflowSignature(req.body, signature, timestamp, secret);

  if (!isValid) {
    console.error('Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }

  // Parse the verified payload
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (error) {
    console.error('Failed to parse webhook body:', error);
    return res.status(400).send('Invalid JSON');
  }

  // Log the event
  console.log('Received Webflow webhook:', {
    type: event.triggerType,
    timestamp: new Date(parseInt(timestamp)).toISOString()
  });

  // Handle different event types
  try {
    switch (event.triggerType) {
      case 'form_submission':
        console.log('Form submission:', {
          formName: event.payload.name,
          submittedAt: event.payload.submittedAt,
          data: event.payload.data
        });
        // Add your form submission handling logic here
        break;

      case 'ecomm_new_order':
        console.log('New order:', {
          orderId: event.payload.orderId,
          total: event.payload.total,
          currency: event.payload.currency
        });
        // Add your order processing logic here
        break;

      case 'collection_item_created':
        console.log('New CMS item:', {
          id: event.payload._id,
          name: event.payload.name,
          collection: event.payload._cid
        });
        // Add your CMS sync logic here
        break;

      case 'collection_item_changed':
        console.log('CMS item updated:', {
          id: event.payload._id,
          name: event.payload.name
        });
        // Add your CMS update sync logic here
        break;

      case 'collection_item_deleted':
        console.log('CMS item deleted:', {
          id: event.payload._id
        });
        // Add your CMS deletion sync logic here
        break;

      case 'site_publish':
        console.log('Site published');
        // Add cache clearing or build trigger logic here
        break;

      case 'user_account_added':
        console.log('New user account:', {
          userId: event.payload.userId
        });
        // Add your user account creation logic here
        break;

      default:
        console.log('Unhandled event type:', event.triggerType);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent retries if we've verified the signature
    res.status(200).send('OK');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Webflow webhook handler listening on port ${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/webflow`);
  });
}

module.exports = { app, verifyWebflowSignature };