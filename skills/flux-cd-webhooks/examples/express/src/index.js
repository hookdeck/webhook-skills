require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Flux CD generic-hmac webhook.
 * X-Signature is `sha256=<hex>` (bare hex is also accepted): HMAC-SHA256 of the raw body only.
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string|undefined} signature - X-Signature header
 * @param {string|undefined} secret - The `token` from the Provider's Secret
 * @returns {boolean}
 */
function verifyFluxWebhook(rawBody, signature, secret) {
  if (!signature || !secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }

  const digest = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;

  // Validate the format before decoding: exactly 64 hex characters (case-insensitive)
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(digest, 'hex');

  return crypto.timingSafeEqual(received, expected);
}

// Flux CD webhook endpoint - raw body of any content type so the exact bytes are verified
app.post('/webhooks/flux-cd',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-signature'];

    if (!verifyFluxWebhook(req.body, signature, process.env.FLUX_CD_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid payload');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // Flux has no event-name field: branch on severity and reason
    const { severity, reason, message, involvedObject } = event;
    const target = `${involvedObject?.kind}/${involvedObject?.namespace}/${involvedObject?.name}`;

    switch (severity) {
      case 'error':
        console.log(`Flux error on ${target}: ${reason} - ${message}`);
        // TODO: Page on-call, open an incident, etc. (e.g. reason ValidationFailed, ReconciliationFailed)
        break;

      case 'info':
        console.log(`Flux info on ${target}: ${reason} - ${message}`);
        // TODO: Record deploys, notify a channel, etc. (e.g. reason ReconciliationSucceeded)
        break;

      default:
        console.log(`Unhandled severity: ${severity}`);
    }

    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFluxWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/flux-cd`);
  });
}
