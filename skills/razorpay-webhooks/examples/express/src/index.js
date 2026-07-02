// Generated with: razorpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');

const app = express();

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the RAW request body with HMAC-SHA256 (hex) using the webhook
 * secret and sends it in the `X-Razorpay-Signature` header. The official SDK's
 * static `validateWebhookSignature(body, signature, secret)` recomputes the
 * HMAC and returns a boolean.
 *
 * @param {Buffer|string} rawBody - Raw request body (NOT parsed JSON)
 * @param {string} signature - Value of the X-Razorpay-Signature header
 * @param {string} secret - Razorpay webhook secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyRazorpayWebhook(rawBody, signature, secret) {
  if (!signature) {
    return false;
  }
  try {
    // rawBody.toString() is fine — the SDK stringifies internally.
    return Razorpay.validateWebhookSignature(rawBody.toString(), signature, secret);
  } catch {
    // Thrown when any argument is missing/invalid.
    return false;
  }
}

// Razorpay webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature BEFORE parsing the body
    if (!verifyRazorpayWebhook(req.body, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString());
    const event = payload.event;

    console.log(`Received ${event} event (created_at: ${payload.created_at})`);

    // The event type is in the body's `event` field, not a header.
    switch (event) {
      case 'payment.authorized': {
        const payment = payload.payload.payment.entity;
        console.log(`Payment authorized: ${payment.id} (${payment.amount} ${payment.currency})`);
        // TODO: Capture the payment or hold for review.
        break;
      }

      case 'payment.captured': {
        const payment = payload.payload.payment.entity;
        console.log(`Payment captured: ${payment.id} (${payment.amount} ${payment.currency})`);
        // TODO: Fulfil the order, grant access, send a receipt.
        break;
      }

      case 'payment.failed': {
        const payment = payload.payload.payment.entity;
        console.log(`Payment failed: ${payment.id} (${payment.error_description || 'unknown error'})`);
        // TODO: Notify the customer, offer a retry.
        break;
      }

      case 'order.paid': {
        const order = payload.payload.order.entity;
        console.log(`Order paid: ${order.id} (amount_paid: ${order.amount_paid})`);
        // TODO: Mark the order complete, start fulfilment.
        break;
      }

      case 'refund.processed': {
        const refund = payload.payload.refund.entity;
        console.log(`Refund processed: ${refund.id} for payment ${refund.payment_id}`);
        // TODO: Update your ledger, notify the customer.
        break;
      }

      case 'subscription.charged': {
        const subscription = payload.payload.subscription.entity;
        console.log(`Subscription charged: ${subscription.id}`);
        // TODO: Extend access, issue an invoice.
        break;
      }

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 2xx to acknowledge receipt (Razorpay retries otherwise)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyRazorpayWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/razorpay`);
  });
}
