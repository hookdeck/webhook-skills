// Generated with: doppler-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Doppler webhook signature
 * @param {Buffer} rawBody - Raw request body (exactly the bytes Doppler signed)
 * @param {string} signatureHeader - X-Doppler-Signature header value (sha256=<hex>)
 * @param {string} secret - The Secret configured on the Doppler webhook
 * @returns {boolean} - Whether signature is valid
 */
function verifyDopplerWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // HMAC-SHA256 of the raw body, hex encoded, prefixed with "sha256="
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual throws on different lengths, so check first
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Doppler webhook endpoint. Read the raw body for any content type so the
// signature is computed over the exact bytes Doppler sent (including custom payloads).
app.post('/webhooks/doppler',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-doppler-signature'];

    if (!verifyDopplerWebhook(req.body, signature, process.env.DOPPLER_WEBHOOK_SECRET)) {
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

    // Default payloads carry a type; custom JSON payloads do not
    const type = payload && typeof payload === 'object' ? payload.type : undefined;
    switch (type) {
      case 'config.secrets.update': {
        const { added = [], removed = [], updated = [] } = payload.diff || {};
        console.log(
          `Secrets changed in ${payload.project?.slug}/${payload.config?.name}:`,
          `+${added.length} -${removed.length} ~${updated.length}`
        );
        // TODO: Restart or redeploy the app, trigger a pipeline, etc.
        break;
      }

      default:
        console.log(`Unhandled payload (type: ${type ?? 'none - custom payload'})`);
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
module.exports = { app, verifyDopplerWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/doppler`);
  });
}
