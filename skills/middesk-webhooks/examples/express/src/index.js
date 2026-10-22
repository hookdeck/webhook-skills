// Generated with: middesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Middesk webhook signature.
 *
 * Middesk sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
 * X-Middesk-Signature-256 header. The key is the secret you set when creating the
 * webhook, used whole as a UTF-8 string (no whsec_ stripping, no base64 decoding).
 * This is NOT Standard Webhooks.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - X-Middesk-Signature-256 header value
 * @param {string} secret - Webhook secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyMiddeskWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// express.raw({ type: '*/*' }) keeps the raw bytes for any content type.
app.post('/webhooks/middesk',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-middesk-signature-256'];

    // Verify the signature before trusting the payload.
    if (!verifyMiddeskWebhook(req.body, signature, process.env.MIDDESK_WEBHOOK_SECRET)) {
      console.error('Middesk webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification.
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const object = event.data && event.data.object;
    console.log(`Received Middesk event ${event.id}: ${event.type}`);

    switch (event.type) {
      case 'business.created':
        console.log(`Business ${object?.id} created (status: ${object?.status})`);
        // TODO: Store the business ID against your customer record.
        break;

      case 'business.updated':
        console.log(`Business ${object?.id} updated (status: ${object?.status})`);
        // TODO: React to status changes such as approved, rejected or in_review.
        break;

      case 'order.created':
        console.log(`Order ${object?.id} created`);
        break;

      case 'order.updated':
        console.log(`Order ${object?.id} updated (status: ${object?.status})`);
        // TODO: Fetch the completed order results.
        break;

      case 'monitor.created':
      case 'monitor.updated':
        console.log(`Monitor event ${event.type} for ${object?.id}`);
        break;

      case 'tin.retried':
        console.log('TIN retry completed');
        break;

      case 'lien.updated':
        console.log(`Lien ${object?.id} updated`);
        break;

      default:
        // Return 2xx for unhandled types so Middesk does not retry.
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Any 2xx tells Middesk the delivery succeeded.
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyMiddeskWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/middesk`);
  });
}
