// Generated with: orb-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const TOLERANCE_SECONDS = 300; // 5-minute replay window

/**
 * Verify an Orb webhook signature.
 *
 * Orb signs `v1:{X-Orb-Timestamp}:{rawBody}` with HMAC-SHA256 using your
 * per-endpoint signing secret. The hex digest arrives in `X-Orb-Signature`
 * prefixed with `v1=`.
 *
 * @param {Buffer|string} rawBody  Raw request body (Buffer from express.raw)
 * @param {string} signatureHeader Value of X-Orb-Signature
 * @param {string} timestamp       Value of X-Orb-Timestamp (ISO 8601)
 * @param {string} secret          Per-endpoint signing secret
 * @returns {boolean}
 */
function verifyOrbSignature(rawBody, signatureHeader, timestamp, secret) {
  if (!signatureHeader || !timestamp || !secret) return false;

  const provided = signatureHeader.startsWith('v1=')
    ? signatureHeader.slice(3)
    : signatureHeader;

  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedContent = `v1:${timestamp}:${bodyString}`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

function isTimestampFresh(timestamp, toleranceSeconds = TOLERANCE_SECONDS) {
  const deliveredAt = Date.parse(timestamp);
  if (Number.isNaN(deliveredAt)) return false;
  const skew = Math.abs(Date.now() - deliveredAt) / 1000;
  return skew <= toleranceSeconds;
}

// Orb webhook endpoint — must use raw body for signature verification
app.post(
  '/webhooks/orb',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signatureHeader = req.headers['x-orb-signature'];
    const timestamp = req.headers['x-orb-timestamp'];
    const secret = process.env.ORB_WEBHOOK_SECRET;

    if (!signatureHeader || !timestamp) {
      return res.status(400).send('Missing Orb signature headers');
    }

    if (!isTimestampFresh(timestamp)) {
      return res.status(400).send('Timestamp outside tolerance');
    }

    if (!verifyOrbSignature(req.body, signatureHeader, timestamp, secret)) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Handle the event based on type
    switch (event.type) {
      case 'customer.created':
        console.log('Customer created:', event.properties?.customer_id ?? event.id);
        // TODO: Sync customer to CRM
        break;

      case 'customer.credit_balance_dropped':
        console.log('Credit balance dropped for:', event.properties?.customer_id);
        // TODO: Trigger top-up reminder
        break;

      case 'subscription.created':
        console.log('Subscription created:', event.properties?.subscription_id);
        // TODO: Provision access
        break;

      case 'subscription.started':
        console.log('Subscription started:', event.properties?.subscription_id);
        // TODO: Activate entitlements
        break;

      case 'subscription.ended':
        console.log('Subscription ended:', event.properties?.subscription_id);
        // TODO: Revoke access
        break;

      case 'subscription.plan_changed':
        console.log('Subscription plan changed:', event.properties?.subscription_id);
        // TODO: Update entitlements
        break;

      case 'subscription.usage_exceeded':
        console.log('Usage exceeded for:', event.properties?.subscription_id);
        // TODO: Notify customer / throttle
        break;

      case 'invoice.issued':
        console.log('Invoice issued:', event.properties?.invoice_id);
        // TODO: Record receivable, email invoice
        break;

      case 'invoice.payment_succeeded':
        console.log('Invoice paid:', event.properties?.invoice_id);
        // TODO: Mark paid internally
        break;

      case 'invoice.payment_failed':
        console.log('Invoice payment failed:', event.properties?.invoice_id);
        // TODO: Start dunning
        break;

      case 'data_exports.transfer_success':
        console.log('Data export delivered:', event.id);
        // TODO: Kick off downstream ETL
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyOrbSignature, isTimestampFresh };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/orb`);
  });
}
