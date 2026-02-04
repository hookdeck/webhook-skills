require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Paddle } = require('@paddle/paddle-node-sdk');

const app = express();

// Initialize Paddle SDK if API key is available
const paddle = process.env.PADDLE_API_KEY ? new Paddle(process.env.PADDLE_API_KEY) : null;

/**
 * Verify Paddle webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signatureHeader - Paddle-Signature header value
 * @param {string} secret - Webhook secret key
 * @returns {boolean} - Whether signature is valid
 */
function verifyPaddleSignature(payload, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  try {
    // Parse the signature header (format: ts=1234567890;h1=abc123...)
    const parts = signatureHeader.split(';');
    const timestamp = parts.find(p => p.startsWith('ts='))?.slice(3);
    const signatures = parts
      .filter(p => p.startsWith('h1='))
      .map(p => p.slice(3));

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    // Build the signed payload (timestamp:rawBody)
    const signedPayload = `${timestamp}:${payload}`;

    // Compute the expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Check if any signature matches (handles secret rotation)
    return signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig),
          Buffer.from(expectedSignature)
        );
      } catch {
        return false;
      }
    });
  } catch (err) {
    console.error('Error verifying signature:', err);
    return false;
  }
}

// Paddle webhook endpoint - must use raw body for signature verification
app.post('/webhooks/paddle',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signatureHeader = req.headers['paddle-signature'];
    const payload = req.body.toString();
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    // Option 1: Verify using Paddle SDK (recommended if you have SDK initialized)
    let event;
    if (paddle) {
      try {
        // The SDK handles verification and parsing in one step
        event = paddle.notifications.unmarshal(payload, signatureHeader, secret);
        console.log('Webhook verified using Paddle SDK');
      } catch (err) {
        console.error('SDK webhook verification failed:', err.message);
        return res.status(400).send('Invalid signature');
      }
    } else {
      // Option 2: Manual verification (when SDK is not available)
      const isValid = verifyPaddleSignature(payload, signatureHeader, secret);

      if (!isValid) {
        console.error('Manual webhook signature verification failed');
        return res.status(400).send('Invalid signature');
      }

      // Parse the event
      try {
        event = JSON.parse(payload);
        console.log('Webhook verified using manual verification');
      } catch (err) {
        console.error('Failed to parse webhook payload:', err);
        return res.status(400).send('Invalid JSON');
      }
    }

    // Handle the event based on type
    switch (event.event_type) {
      case 'subscription.created':
        const newSub = event.data;
        console.log('Subscription created:', newSub.id);
        // TODO: Provision access, send welcome email, etc.
        break;

      case 'subscription.activated':
        const activeSub = event.data;
        console.log('Subscription activated:', activeSub.id);
        // TODO: Grant full access after first payment
        break;

      case 'subscription.canceled':
        const canceledSub = event.data;
        console.log('Subscription canceled:', canceledSub.id);
        // TODO: Revoke access, send retention email, etc.
        break;

      case 'subscription.paused':
        const pausedSub = event.data;
        console.log('Subscription paused:', pausedSub.id);
        // TODO: Limit access, send pause confirmation
        break;

      case 'subscription.resumed':
        const resumedSub = event.data;
        console.log('Subscription resumed:', resumedSub.id);
        // TODO: Restore access, send welcome back email
        break;

      case 'transaction.completed':
        const transaction = event.data;
        console.log('Transaction completed:', transaction.id);
        // TODO: Fulfill order, send receipt, etc.
        break;

      case 'transaction.payment_failed':
        const failedTx = event.data;
        console.log('Transaction payment failed:', failedTx.id);
        // TODO: Notify customer, update status, etc.
        break;

      case 'customer.created':
        const newCustomer = event.data;
        console.log('Customer created:', newCustomer.id);
        // TODO: Create customer record, send welcome email, etc.
        break;

      case 'customer.updated':
        const updatedCustomer = event.data;
        console.log('Customer updated:', updatedCustomer.id);
        // TODO: Update customer record, sync changes, etc.
        break;

      default:
        console.log(`Unhandled event type: ${event.event_type}`);
    }

    // Return 200 to acknowledge receipt (respond within 5 seconds)
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPaddleSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paddle`);
  });
}
