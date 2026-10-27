// Generated with: spree-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Spree delivery: X-Spree-Webhook-Signature is the bare hex
 * HMAC-SHA256 of the bytes "<X-Spree-Webhook-Timestamp>." + raw body, keyed with
 * the endpoint's secret_key (UTF-8, used as-is, not hex-decoded).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 */
function verifySpreeSignature(rawBody, signature, timestamp, secret, toleranceSeconds = 0) {
  if (!signature || !timestamp || !secret) return false;

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters)
  if (!HEX_64.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Build the signed message as bytes: "<timestamp>." + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Hex is case-insensitive: decode to bytes, then compare equal-length buffers in constant time
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

// Spree webhook endpoint - must use the raw body
app.post('/webhooks/spree',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tolerance = Number(process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS) || 0;

    if (!verifySpreeSignature(
      rawBody,
      req.get('X-Spree-Webhook-Signature'),
      req.get('X-Spree-Webhook-Timestamp'),
      process.env.SPREE_WEBHOOK_SECRET,
      tolerance
    )) {
      console.error('Spree webhook verification failed');
      return res.sendStatus(401);
    }

    // Parse only after the signature check
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    // Deduplicate on event.id: a re-sent delivery carries the same id
    const data = event.data || {};

    // Dispatch on the body's name (also sent as X-Spree-Webhook-Event)
    switch (event.name) {
      case 'order.placed':
        console.log('Order placed:', { eventId: event.id, order: data.id });
        // TODO: Send the order to your fulfilment or CRM system
        break;

      case 'order.paid':
        console.log('Order paid:', { eventId: event.id, order: data.id });
        // TODO: Release the order for fulfilment
        break;

      case 'order.canceled':
        console.log('Order canceled:', { eventId: event.id, order: data.id });
        // TODO: Cancel downstream work
        break;

      case 'payment.completed':
        console.log('Payment completed:', { eventId: event.id, payment: data.id });
        // TODO: Record the payment
        break;

      case 'fulfillment.fulfilled':
        console.log('Parcel shipped:', { eventId: event.id, fulfillment: data.id });
        // TODO: Notify the customer with tracking details
        break;

      case 'user.created':
        console.log('Customer registered:', { eventId: event.id, user: data.id });
        // TODO: Sync the customer to your CRM
        break;

      case 'product.updated':
        console.log('Product updated:', { eventId: event.id, product: data.id });
        // TODO: Refresh your search index or cache
        break;

      case 'webhook.test':
        console.log('Test delivery received:', { eventId: event.id });
        break;

      default:
        console.log(`Unhandled event: ${event.name}`);
    }

    // Any 2xx acknowledges the delivery
    res.sendStatus(200);
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/spree`);
  });
}
