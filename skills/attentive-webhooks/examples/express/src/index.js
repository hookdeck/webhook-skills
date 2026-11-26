// Generated with: attentive-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Attentive webhook signature.
 *
 * Attentive signs the raw request body with HMAC-SHA256 keyed on your
 * per-webhook signing key and sends the hex-encoded digest in the
 * `x-attentive-hmac-sha256` header. There is no timestamp in the signature.
 *
 * @param {Buffer} rawBody - Raw request body (do NOT re-serialize the JSON)
 * @param {string} signatureHeader - x-attentive-hmac-sha256 header value
 * @param {string} secret - Attentive webhook signing key
 * @returns {boolean} Whether the signature is valid
 */
function verifyAttentiveWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Compute the expected signature over the raw body, hex-encoded
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guards against non-hex / wrong-length input
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Attentive webhook endpoint - must use raw body for signature verification
app.post('/webhooks/attentive',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-attentive-hmac-sha256'];

    // Verify webhook signature before trusting the payload
    if (!verifyAttentiveWebhook(req.body, signature, process.env.ATTENTIVE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const { type, timestamp, subscriber } = payload;

    console.log(`Received ${type} event at ${new Date(timestamp).toISOString()}`);

    // Handle the event based on its type
    switch (type) {
      case 'sms.subscribed':
        console.log('SMS opt-in:', subscriber?.phone);
        // Your code: Sync opt-in state, trigger welcome flow, etc.
        break;

      case 'sms.unsubscribed':
        console.log('SMS opt-out:', subscriber?.phone);
        // Your code: Suppress sends, update CRM consent, etc.
        break;

      case 'sms.sent':
        console.log('SMS sent to:', subscriber?.phone);
        // Your code: Delivery logging, analytics, etc.
        break;

      case 'sms.inbound_message':
        console.log('Inbound SMS from:', subscriber?.phone);
        // Your code: Support routing, keyword automations, etc.
        break;

      case 'sms.message_link_click':
        console.log('SMS link click:', subscriber?.phone);
        // Your code: Attribution, engagement scoring, etc.
        break;

      case 'email.subscribed':
        console.log('Email opt-in:', subscriber?.email);
        // Your code: Sync opt-in state, etc.
        break;

      case 'email.unsubscribed':
        console.log('Email opt-out:', subscriber?.email);
        // Your code: Suppress sends, update consent, etc.
        break;

      case 'email.sent':
        console.log('Email sent to:', subscriber?.email);
        // Your code: Delivery logging, etc.
        break;

      case 'email.opened':
        console.log('Email opened by:', subscriber?.email);
        // Your code: Engagement scoring, re-targeting, etc.
        break;

      case 'email.message_link_click':
        console.log('Email link click:', subscriber?.email);
        // Your code: Attribution, engagement scoring, etc.
        break;

      case 'custom_attribute.set':
        console.log('Custom attribute set for:', subscriber?.phone || subscriber?.email);
        // Your code: Sync enriched data to your systems, etc.
        break;

      default:
        console.log(`Unhandled event: ${type}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyAttentiveWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/attentive`);
  });
}
