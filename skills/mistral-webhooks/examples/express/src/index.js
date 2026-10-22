require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PREFIX = 'hmac-sha256=';

/**
 * Verify a Mistral webhook signature.
 * Header format: x-mistral-signature: hmac-sha256=<hex>
 * Signed content: the raw request body, keyed with the endpoint secret (UTF-8).
 * @param {Buffer} rawBody
 * @param {string} signatureHeader
 * @param {string} secret
 * @returns {boolean}
 */
function verifyMistralWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Raw body is required for signature verification; '*/*' verifies any content type
app.post('/webhooks/mistral',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-mistral-signature'];

    if (!signature) {
      return res.status(400).send('Missing x-mistral-signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyMistralWebhook(req.body, signature, process.env.MISTRAL_WEBHOOK_SECRET)) {
      console.error('Mistral webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const { event, data = {} } = payload;

    // Retries can deliver the same event twice: dedupe on session_id + event in production
    switch (event) {
      case 'call_started':
        console.log(`Call started: ${data.session_id} (agent ${data.agent_id})`);
        // TODO: open a call record
        break;

      case 'call_ended':
        console.log(`Call ended: ${data.session_id} after ${data.duration_seconds}s`);
        // transcript is best effort and may be null
        // TODO: store transcript, update CRM
        break;

      case 'call_failed':
        console.log(`Call failed: ${data.session_id} (${data.error})`);
        // TODO: alert, track failure
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Acknowledge quickly; Mistral times out after 10 seconds
    res.status(200).json({ status: 'ok' });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyMistralWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mistral`);
  });
}
