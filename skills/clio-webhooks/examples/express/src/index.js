// Generated with: clio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Clio webhook signature.
 *
 * Clio computes HMAC-SHA256(shared_secret, raw_body) and sends it in the
 * `X-Hook-Signature` header (no prefix). Verify against the RAW body.
 *
 * Clio's docs compute a lowercase hex digest (`hexdigest`). We compute it once
 * and also accept base64 as a safety net; the wrong encoding never matches.
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signatureHeader - X-Hook-Signature header value
 * @param {string} secret - Shared secret from the X-Hook-Secret handshake
 * @returns {boolean} Whether the signature is valid
 */
function verifyClioWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();

  // Hex per Clio's docs, base64 as a safety net — timing-safe either way.
  return [digest.toString('hex'), digest.toString('base64')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false; // length mismatch → not a match
    }
  });
}

// Clio webhook endpoint - must use the raw body for signature verification.
app.post('/webhooks/clio',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    // 1. Handshake: Clio sends X-Hook-Secret when the webhook is created or its
    //    URL changes. Confirm activation by echoing the secret back with 200.
    //    The webhook is not enabled until this handshake succeeds.
    const hookSecret = req.headers['x-hook-secret'];
    if (hookSecret) {
      console.log('Clio handshake received - confirming activation');
      res.set('X-Hook-Secret', hookSecret);
      return res.status(200).end();
      // Tip: persist `hookSecret` (as CLIO_WEBHOOK_SECRET, keyed by webhook_id)
      // so you can verify signatures on later deliveries.
    }

    // 2. Event delivery: verify the X-Hook-Signature over the raw body.
    const signature = req.headers['x-hook-signature'];
    if (!verifyClioWebhook(req.body, signature, process.env.CLIO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification.
    const payload = JSON.parse(req.body.toString());
    const event = payload.meta?.event;
    const webhookId = payload.meta?.webhook_id;
    const record = payload.data || {};

    console.log(`Received "${event}" event (webhook: ${webhookId}, id: ${record.id})`);

    // Handle the event based on meta.event.
    switch (event) {
      case 'created':
        console.log(`Record created: ${record.id}`);
        // Your code: sync the new record into your system
        break;

      case 'updated':
        console.log(`Record updated: ${record.id}`);
        // Your code: update your local copy
        break;

      case 'deleted':
        console.log(`Record deleted: ${record.id}`);
        // Your code: soft-delete / archive locally
        break;

      case 'matter_opened':
        console.log(`Matter opened: ${record.id}`);
        // Your code: kick off intake / billing setup
        break;

      case 'matter_pended':
        console.log(`Matter pended: ${record.id}`);
        // Your code: pause automations
        break;

      case 'matter_closed':
        console.log(`Matter closed: ${record.id}`);
        // Your code: final invoicing / close-out
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Respond quickly (2xx) to acknowledge; defer heavy work.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyClioWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clio`);
  });
}
