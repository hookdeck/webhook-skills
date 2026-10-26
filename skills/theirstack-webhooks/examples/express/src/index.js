// Generated with: theirstack-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a TheirStack webhook signature.
 *
 * TheirStack signs the RAW request body with HMAC-SHA256 keyed on the webhook's
 * signing secret and sends "sha256=<hex>" in X-TheirStack-Signature-256.
 * The header is only sent when a signing secret is configured.
 *
 * @param {Buffer} rawBody - Raw request body (unparsed bytes)
 * @param {string|undefined} signatureHeader - X-TheirStack-Signature-256 value
 * @param {string} secret - Signing secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyTheirStackWebhook(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  // Require exactly 64 hex chars before Buffer.from(x, 'hex'), which would
  // otherwise silently truncate invalid input.
  const received = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// Read the raw body for any content type so the signature always verifies
app.post('/webhooks/theirstack',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-theirstack-signature-256'];

    // Verify first, parse second
    if (!Buffer.isBuffer(req.body) ||
        !verifyTheirStackWebhook(req.body, signature, process.env.THEIRSTACK_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Envelope: { id, type, payload }. The event name is in the body, not a header.
    const { id, type, payload } = event;
    console.log(`Received TheirStack event: ${type} (${id})`);

    switch (type) {
      case 'job.new':
        console.log('New job:', payload?.job_title, payload?.company_domain);
        // TODO: Add to CRM, alert sales, etc. Dedupe on payload.id.
        break;

      case 'company.new':
        console.log('New company:', payload?.name, payload?.domain);
        // TODO: Create a lead, enrich, etc.
        break;

      case 'job.closed':
        // Minimal payload: { id, closed_at }
        console.log('Job closed:', payload?.id, payload?.closed_at);
        // TODO: Mark the job as closed in your system.
        break;

      case 'tech.new':
        console.log('New technology detected for company');
        // TODO: Update technographic records (access is by request).
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Any 2xx acknowledges receipt; failures are retried hourly for 48 hours
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTheirStackWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/theirstack`);
  });
}
