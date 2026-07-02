// Generated with: coinbase-commerce-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { Webhook } = require('coinbase-commerce-node');

const app = express();

const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

// Coinbase Commerce webhook endpoint.
// Must use the RAW body for signature verification - do not parse JSON first.
app.post(
  '/webhooks/coinbase-commerce',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // req.body is a Buffer here (express.raw). Get the raw string.
    const rawBody = req.body.toString('utf8');
    const signature = req.headers['x-cc-webhook-signature'];

    if (!signature) {
      return res.status(400).send('Missing X-CC-Webhook-Signature header');
    }

    let event;
    try {
      // Verify the signature using the official Coinbase Commerce SDK.
      // Returns the verified event; throws on an invalid signature or payload.
      event = Webhook.verifyEventBody(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event based on its type.
    switch (event.type) {
      case 'charge:created':
        console.log('Charge created:', event.data.id);
        // TODO: Record the pending charge.
        break;

      case 'charge:pending':
        console.log('Charge pending (payment detected):', event.data.id);
        // TODO: Show a "payment received, confirming" state.
        break;

      case 'charge:confirmed':
        console.log('Charge confirmed:', event.data.id);
        // TODO: Fulfill the order, grant access, send a receipt.
        break;

      case 'charge:failed':
        console.log('Charge failed:', event.data.id);
        // TODO: Cancel the order, notify the customer.
        break;

      case 'charge:delayed':
        console.log('Charge delayed (late/under/overpaid):', event.data.id);
        // TODO: Flag for manual review.
        break;

      case 'charge:resolved':
        console.log('Charge resolved:', event.data.id);
        // TODO: Complete or refund based on the resolution.
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 quickly to acknowledge receipt.
    res.json({ received: true });
  }
);

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing.
module.exports = app;

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      `Webhook endpoint: POST http://localhost:${PORT}/webhooks/coinbase-commerce`
    );
  });
}
