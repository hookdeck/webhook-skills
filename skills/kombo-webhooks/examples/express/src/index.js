// Generated with: kombo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Kombo webhook signature.
 *
 * Kombo signs the RAW request body with HMAC-SHA256, keyed with the Kombo
 * Webhook Secret's UTF-8 bytes (not decoded), and sends the digest in the
 * X-Kombo-Signature header as base64url WITHOUT padding.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed bytes)
 * @param {string} signatureHeader - X-Kombo-Signature header value
 * @param {string} secret - Kombo Webhook Secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyKomboWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64url');

  // Compare base64url text (padding stripped); decoding would skip invalid characters
  const provided = Buffer.from(signatureHeader.replace(/=+$/, ''));

  // timingSafeEqual throws on length mismatch, so check length first
  return provided.length === expected.length && crypto.timingSafeEqual(provided, Buffer.from(expected));
}

// express.raw with '*/*' keeps the raw bytes whatever Content-Type Kombo sends
app.post('/webhooks/kombo',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-kombo-signature'];

    // Verify first, before parsing
    if (!Buffer.isBuffer(req.body) || !verifyKomboWebhook(req.body, signature, process.env.KOMBO_WEBHOOK_SECRET)) {
      console.error('Kombo webhook signature verification failed');
      // 4xx is not retried by Kombo
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Payload shape: { id, type, data }. The event name is `type`.
    const { id, type, data } = event;
    console.log(`Received Kombo event: ${type} (${id})`);

    // Kombo may deliver an event more than once: dedupe on `id` in production.
    switch (type) {
      case 'data-changed':
        console.log('Data changed:', data?.integration_id, data?.changed_models);
        // TODO: fetch updated data from Kombo with the updated_after filter
        break;

      case 'sync-finished':
        // Deprecated by Kombo; prefer data-changed
        console.log('Sync finished:', data?.sync_id, data?.sync_state);
        break;

      case 'integration-created':
        console.log('Integration created:', data?.id, data?.tool);
        // TODO: store the integration
        break;

      case 'integration-deleted':
        console.log('Integration deleted:', data?.id);
        // TODO: remove the integration and its data
        break;

      case 'integration-state-changed':
        console.log('Integration state changed:', data?.integration_id, data?.state);
        // TODO: if INVALID, ask the customer to reconnect
        break;

      case 'connection-flow-failed':
        console.log('Connection flow failed:', data?.integration_tool, data?.log_url);
        break;

      case 'issue-status-changed':
        console.log('Issue', data?.change, data?.issue?.type);
        break;

      case 'assessment:order-received':
        console.log('Assessment ordered:', data?.id, data?.package_id);
        break;

      default:
        // Kombo adds event types over time: acknowledge unknown ones
        console.log(`Unhandled event: ${type}`);
    }

    // Acknowledge quickly with a 2xx
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyKomboWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/kombo`);
  });
}
