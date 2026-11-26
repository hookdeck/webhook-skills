// Generated with: airwallex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_SECRET = process.env.AIRWALLEX_WEBHOOK_SECRET;

// Reject events whose timestamp is too far from now (replay protection).
// Airwallex's x-timestamp is in MILLISECONDS. The docs don't mandate a window;
// 5 minutes is a sensible default that tolerates retries and clock skew.
const TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verify an Airwallex webhook signature.
 *
 * Airwallex signs HMAC-SHA256 over `x-timestamp + raw_body` (timestamp first),
 * keyed with the endpoint's secret, and sends the hex digest as `x-signature`.
 * Always hash the raw, unmodified body — never re-serialized JSON.
 */
function verifyAirwallexSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp) // x-timestamp string
    .update(rawBody)   // raw request body (Buffer)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  // Constant-time compare; length check avoids timingSafeEqual throwing.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The webhook route MUST use the raw body for signature verification.
app.post(
  '/webhooks/airwallex',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const timestamp = req.headers['x-timestamp'];
    const signature = req.headers['x-signature'];
    const rawBody = req.body; // Buffer, thanks to express.raw()

    if (!timestamp || !signature) {
      return res.status(400).send('Missing x-timestamp or x-signature header');
    }

    // Optional replay protection.
    if (Math.abs(Date.now() - Number(timestamp)) > TOLERANCE_MS) {
      return res.status(400).send('Timestamp outside tolerance');
    }

    // 1. Verify BEFORE parsing.
    if (!verifyAirwallexSignature(rawBody, timestamp, signature, WEBHOOK_SECRET)) {
      return res.status(400).send('Invalid signature');
    }

    // 2. Parse the verified raw body.
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // 3. Dispatch on the event `name` (Airwallex uses `name`, not `type`).
    // The changed resource lives in event.data.object.
    const resource = event.data && event.data.object;
    switch (event.name) {
      case 'payment_intent.succeeded':
        console.log('PaymentIntent succeeded:', resource && resource.id);
        // Your code: fulfill the order, send a receipt, etc.
        break;

      case 'payment_attempt.paid':
        console.log('Payment attempt paid:', resource && resource.id);
        // Your code: mark the attempt as paid.
        break;

      case 'refund.settled':
        console.log('Refund settled:', resource && resource.id);
        // Your code: reconcile the refund.
        break;

      case 'refund.failed':
        console.log('Refund failed:', resource && resource.id);
        // Your code: alert / retry the refund.
        break;

      case 'payment_consent.verified':
        console.log('Payment consent verified:', resource && resource.id);
        // Your code: enable recurring / merchant-initiated payments.
        break;

      case 'payment_dispute.requires_response':
        console.log('Dispute requires response:', resource && resource.id);
        // Your code: gather and submit evidence before the deadline.
        break;

      default:
        console.log(`Unhandled event type: ${event.name}`);
    }

    // Return 200 quickly to acknowledge receipt. Do heavy work asynchronously.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/airwallex`);
  });
}
