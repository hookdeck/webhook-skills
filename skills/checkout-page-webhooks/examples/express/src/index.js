// Generated with: checkout-page-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Checkout Page webhook signature.
 *
 * Checkout Page sends `x-webhook-signature: sha256=<64 hex>`, the hex
 * HMAC-SHA256 of the raw body keyed with the signing secret. Nothing else
 * (including x-webhook-timestamp) is signed.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string|undefined} signatureHeader - `x-webhook-signature` header value
 * @param {string|undefined} secret - Signing secret (used as UTF-8 bytes)
 * @returns {boolean} Whether the signature is valid
 */
function verifyCheckoutPageWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  // Accept "sha256=<hex>" or the bare digest; validate length + alphabet before decoding
  const match = /^(?:sha256=)?([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1].toLowerCase(), 'hex'), expected);
}

// In-memory dedupe for the example; use a shared store (Redis, DB) in production
const seenEventIds = new Set();

// Read the exact bytes for any content type; parse only after verification
app.post(
  '/webhooks/checkout-page',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CHECKOUT_PAGE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CHECKOUT_PAGE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.get('x-webhook-signature');

    if (!signature) {
      return res.status(401).send('Missing signature header');
    }
    if (!verifyCheckoutPageWebhook(rawBody, signature, secret)) {
      console.error('Checkout Page webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (payload === null || typeof payload !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // Retries re-send the same eventId
    const eventId = payload.eventId;
    if (eventId && seenEventIds.has(eventId)) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    if (eventId) seenEventIds.add(eventId);

    const attempt = req.get('x-webhook-delivery-attempt');
    console.log(`Received ${payload.event} (eventId ${eventId}, attempt ${attempt})`);
    const data = payload.data || {};

    switch (payload.event) {
      case 'payment.paid':
        console.log('Payment paid:', JSON.stringify(data.payment ?? data));
        // TODO: Fulfil the order, grant access
        break;

      case 'payment.created':
        console.log('Payment created');
        break;

      case 'payment.abandoned':
        console.log('Payment abandoned');
        break;

      case 'booking.created':
        console.log('Booking created:', JSON.stringify(data.booking ?? data));
        // TODO: Sync to calendar / CRM
        break;

      case 'booking.paid':
        console.log('Booking paid');
        break;

      case 'subscription.created':
      case 'subscription.active':
        console.log(`Subscription started (${payload.event})`);
        // TODO: Provision features
        break;

      case 'subscription.canceled':
      case 'subscription.expired':
        console.log(`Subscription ended (${payload.event})`);
        // TODO: Revoke access
        break;

      case 'customer.created':
      case 'customer.updated':
        console.log(`Customer event: ${payload.event}`);
        break;

      case 'submission.created':
        console.log('Form submission created');
        break;

      default:
        console.log(`Unhandled event: ${payload.event}`);
    }

    // Acknowledge quickly; do slow work asynchronously
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCheckoutPageWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/checkout-page`);
  });
}
