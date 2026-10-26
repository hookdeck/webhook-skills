// Generated with: anarlog-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify an Anarlog webhook signature
 * @param {Buffer} rawBody - Raw request body (exactly the bytes Anarlog signed)
 * @param {string} signatureHeader - x-anarlog-signature header value (sha256=<hex>)
 * @param {string} secret - The full whsec_... signing secret, used as a plain UTF-8 HMAC key
 * @returns {boolean} - Whether signature is valid
 */
function verifyAnarlogWebhook(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) {
    return false;
  }
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  // Exactly 64 hex chars before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) {
    return false;
  }

  // Key is the whole secret string (whsec_ prefix included). This is NOT Standard Webhooks.
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// Anarlog webhook endpoint. Read the raw body for any content type so the
// signature is computed over the exact bytes Anarlog sent.
app.post('/webhooks/anarlog',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-anarlog-signature'];

    if (!verifyAnarlogWebhook(req.body, signature, process.env.ANARLOG_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const event = payload && typeof payload === 'object' ? payload.event : undefined;
    // Use payload.id (or the x-anarlog-delivery header) to dedupe retries
    switch (event) {
      case 'meeting.completed': {
        const meeting = payload.data?.meeting;
        console.log(`Meeting completed: ${meeting?.title} (${meeting?.id})`);
        // TODO: Archive the transcript, create a CRM activity, notify a channel
        break;
      }

      case 'note.enhanced': {
        const meeting = payload.data?.meeting;
        const actionItems = meeting?.action_items ?? [];
        console.log(`Summary generated for ${meeting?.title}: ${actionItems.length} action items`);
        // TODO: Post the summary, create tasks from action items
        break;
      }

      case 'webhook.test':
        console.log('Received webhook.test from Anarlog');
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 quickly: deliveries time out after 10 seconds
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyAnarlogWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/anarlog`);
  });
}
