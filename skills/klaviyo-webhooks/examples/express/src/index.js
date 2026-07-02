// Generated with: klaviyo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Klaviyo system webhook signature.
 *
 * Klaviyo signs the raw request body with the Klaviyo-Timestamp header value
 * appended: HMAC-SHA256(secret, rawBody + timestamp), hex-encoded. The result
 * is sent in the Klaviyo-Signature header.
 *
 * @param {Buffer} rawBody - Raw request body (do not JSON.parse before verifying)
 * @param {string} timestamp - Klaviyo-Timestamp header value
 * @param {string} signature - Klaviyo-Signature header value (hex)
 * @param {string} secret - Endpoint secret set when the webhook was created
 * @returns {boolean} Whether the signature is valid
 */
function verifyKlaviyoWebhook(rawBody, timestamp, signature, secret) {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)      // raw body FIRST
    .update(timestamp)    // Klaviyo-Timestamp appended
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false; // different lengths = invalid
  }
}

/**
 * Dispatch a single Klaviyo event based on its topic.
 * A webhook delivery batches up to 1,000 events in the `data` array.
 */
function handleEvent(event) {
  const { topic, external_id: id } = event;

  switch (topic) {
    case 'event:klaviyo.opened_email':
      console.log('Email opened:', id);
      // TODO: update engagement score, etc.
      break;

    case 'event:klaviyo.clicked_email':
      console.log('Email clicked:', id);
      // TODO: track link click, trigger follow-up, etc.
      break;

    case 'event:klaviyo.bounced_email':
      console.log('Email bounced:', id);
      // TODO: flag address, suppress future sends, etc.
      break;

    case 'event:klaviyo.marked_email_as_spam':
      console.log('Email marked as spam:', id);
      // TODO: suppress profile, review content, etc.
      break;

    case 'event:klaviyo.unsubscribed_from_email_marketing':
      console.log('Unsubscribed from email marketing:', id);
      // TODO: sync suppression to your system, etc.
      break;

    case 'event:klaviyo.sent_sms':
      console.log('SMS sent:', id);
      // TODO: record message delivery, etc.
      break;

    case 'event:klaviyo.received_sms':
      console.log('Inbound SMS received:', id);
      // TODO: route to support, trigger reply flow, etc.
      break;

    case 'event:klaviyo.submitted_review':
      console.log('Review submitted:', id);
      // TODO: sync review, notify team, etc.
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }
}

// Klaviyo webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/klaviyo',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['klaviyo-signature'];
    const timestamp = req.headers['klaviyo-timestamp'];

    if (!signature || !timestamp) {
      return res.status(400).send('Missing signature headers');
    }

    // Verify the signature over the raw body before parsing
    if (!verifyKlaviyoWebhook(req.body, timestamp, signature, process.env.KLAVIYO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Safe to parse now that the signature is verified
    const body = JSON.parse(req.body.toString());

    for (const event of body.data || []) {
      handleEvent(event);
    }

    // Acknowledge quickly with a 2xx; do heavy work asynchronously
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyKlaviyoWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/klaviyo`);
  });
}
