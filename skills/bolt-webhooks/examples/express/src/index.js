// Generated with: bolt-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Bolt webhook signature.
 * Bolt sends base64(HMAC-SHA256(rawBody, signingSecret)) in X-Bolt-Hmac-Sha256.
 * @param {Buffer} rawBody - Raw request body, exactly as received
 * @param {string} hmacHeader - X-Bolt-Hmac-Sha256 header value
 * @param {string} secret - Bolt Signing Secret
 * @returns {boolean}
 */
function verifyBoltWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false; // Different lengths = invalid
  }
}

// Bolt webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/bolt',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-bolt-hmac-sha256'];

    if (!signature) {
      return res.status(400).send('Missing X-Bolt-Hmac-Sha256 header');
    }

    if (!verifyBoltWebhook(req.body, signature, process.env.BOLT_SIGNING_SECRET)) {
      console.error('Bolt webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Bolt has no event ID; dedupe on type + transaction id before side effects
    const data = event.data || {};
    console.log(`Received Bolt ${event.type} webhook (${event.object})`);

    switch (event.type) {
      case 'pending':
        console.log('Transaction pending fraud review:', data.reference);
        break;
      case 'payment':
        console.log('Payment captured:', data.reference, data.amount);
        // TODO: Mark order as paid (automatic capture)
        break;
      case 'auth':
        console.log('Transaction authorized:', data.reference);
        // TODO: Begin the capture process (manual capture)
        break;
      case 'capture':
        console.log('Manual capture succeeded:', data.reference);
        break;
      case 'credit':
        console.log('Refund processed:', data.reference);
        break;
      case 'void':
        console.log('Transaction voided:', data.reference);
        break;
      case 'failed_payment':
        console.log('Payment failed pre-authorization:', data.reference);
        break;
      case 'rejected_irreversible':
        console.log('Transaction permanently rejected:', data.reference);
        break;
      case 'rejected_reversible':
        console.log('Transaction rejected (re-review possible):', data.reference);
        break;
      case 'risk_insights':
        console.log('Risk insights available:', data.reference);
        break;
      case 'newsletter_subscription':
        console.log('Newsletter subscription:', data.reference);
        break;
      case 'credit_card_deleted':
        console.log('Saved credit card deleted (beta):', data.user && data.user.id);
        break;
      default:
        console.log(`Unhandled Bolt event type: ${event.type}`);
    }

    // Return 200 with a JSON body; non-200 or non-JSON responses are retried
    res.status(200).json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyBoltWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bolt`);
  });
}
