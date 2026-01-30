require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Hookdeck webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - x-hookdeck-signature header value
 * @param {string} secret - Hookdeck webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyHookdeckSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(hash)
    );
  } catch {
    return false;
  }
}

// Webhook endpoint - must use raw body for signature verification
app.post('/webhooks',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hookdeck-signature'];
    const eventId = req.headers['x-hookdeck-event-id'];
    const sourceId = req.headers['x-hookdeck-source-id'];
    const attemptNumber = req.headers['x-hookdeck-attempt-number'];

    // Verify Hookdeck signature
    if (!verifyHookdeckSignature(req.body, signature, process.env.HOOKDECK_WEBHOOK_SECRET)) {
      console.error('Hookdeck signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());

    console.log(`Received event ${eventId} from source ${sourceId} (attempt ${attemptNumber})`);

    // Handle based on the original event type
    // The payload structure depends on the source (Stripe, Shopify, etc.)
    const eventType = payload.type || payload.topic || 'unknown';
    console.log(`Event type: ${eventType}`);

    // Example: Handle Stripe events
    if (payload.type) {
      switch (payload.type) {
        case 'payment_intent.succeeded':
          console.log('Payment succeeded:', payload.data?.object?.id);
          break;
        case 'customer.subscription.created':
          console.log('Subscription created:', payload.data?.object?.id);
          break;
        default:
          console.log('Received event:', payload.type);
      }
    }

    // Example: Handle Shopify events (topic in headers originally, but in body after Hookdeck)
    if (payload.id && !payload.type) {
      console.log('Shopify-style event, resource ID:', payload.id);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true, eventId });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyHookdeckSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks`);
  });
}
