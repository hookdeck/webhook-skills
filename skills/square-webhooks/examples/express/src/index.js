// Generated with: square-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { WebhooksHelper } = require('square');

const app = express();

const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
// The notification URL is part of the signed content, so it must match the URL
// registered on your Square webhook subscription exactly.
const notificationUrl = process.env.SQUARE_WEBHOOK_URL;

/**
 * Verify a Square webhook using the official SDK helper.
 * Square signs HMAC-SHA256(notificationUrl + rawBody), base64-encoded.
 * @param {string} rawBody - Raw request body as a string
 * @param {string} signatureHeader - x-square-hmacsha256-signature header value
 * @returns {Promise<boolean>} Whether the signature is valid
 */
async function verifySquareSignature(rawBody, signatureHeader) {
  try {
    return await WebhooksHelper.verifySignature({
      requestBody: rawBody,
      signatureHeader,
      signatureKey,
      notificationUrl,
    });
  } catch (err) {
    // Thrown when the signature key or notification URL is missing/empty.
    console.error('Square signature verification error:', err.message);
    return false;
  }
}

// Square webhook endpoint - must use the raw body for signature verification.
app.post(
  '/webhooks/square',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['x-square-hmacsha256-signature'];
    const rawBody = req.body.toString('utf8');

    if (!signature) {
      console.error('Missing Square signature header');
      return res.status(400).send('Missing signature');
    }

    if (!(await verifySquareSignature(rawBody, signature))) {
      console.error('Square webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after the signature is verified.
    const event = JSON.parse(rawBody);
    const { type, event_id, data } = event;

    console.log(`Received Square event ${type} (${event_id})`);

    // Handle the event based on its type.
    switch (type) {
      case 'payment.created':
        console.log('Payment created:', data?.id);
        // TODO: Record the sale, start fulfillment, etc.
        break;

      case 'payment.updated':
        console.log('Payment updated:', data?.id);
        // TODO: Confirm capture, reconcile ledgers, etc.
        break;

      case 'refund.created':
        console.log('Refund created:', data?.id);
        // TODO: Update order status, notify customer, etc.
        break;

      case 'refund.updated':
        console.log('Refund updated:', data?.id);
        // TODO: Reconcile refunds when completed, etc.
        break;

      case 'invoice.payment_made':
        console.log('Invoice payment made:', data?.id);
        // TODO: Mark invoice paid, send receipt, etc.
        break;

      case 'order.created':
        console.log('Order created:', data?.id);
        // TODO: Sync to inventory / OMS, etc.
        break;

      case 'order.updated':
        console.log('Order updated:', data?.id);
        // TODO: Update fulfillment, sync line items, etc.
        break;

      case 'customer.created':
        console.log('Customer created:', data?.id);
        // TODO: CRM sync, welcome email, etc.
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Return 2xx promptly to acknowledge receipt.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = { app, verifySquareSignature };

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/square`);
  });
}
