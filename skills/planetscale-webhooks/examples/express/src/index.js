// Generated with: planetscale-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Verify a PlanetScale webhook signature
 * @param {Buffer} rawBody - Raw request body (exactly the bytes PlanetScale signed)
 * @param {string} signatureHeader - X-PlanetScale-Signature header value (bare hex digest)
 * @param {string} secret - The webhook secret, used as-is as a UTF-8 HMAC key
 * @returns {boolean} - Whether signature is valid
 */
function verifyPlanetScaleWebhook(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) {
    return false;
  }

  // Exactly 64 hex chars before decoding: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}

// PlanetScale webhook endpoint. Read the raw body for any content type so the
// signature is computed over the exact bytes PlanetScale sent.
app.post('/webhooks/planetscale',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-planetscale-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (!verifyPlanetScaleWebhook(rawBody, signature, process.env.PLANETSCALE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification, and treat every field as untrusted
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!isObject(payload)) {
      return res.status(400).send('Invalid payload');
    }

    const event = typeof payload.event === 'string' ? payload.event : undefined;
    const resource = isObject(payload.resource) ? payload.resource : {};
    const database = typeof payload.database === 'string' ? payload.database : undefined;
    // No delivery ID header: dedupe on event + resource.id + timestamp if you need idempotency

    switch (event) {
      case 'webhook.test':
        console.log(`Received webhook.test for database ${database}`);
        break;

      case 'branch.ready':
        console.log(`Branch ${resource.name} is ready on ${database}`);
        // TODO: Run migrations, post connection details to a channel
        break;

      case 'branch.anomaly':
        console.log(`Anomaly on branch ${resource.name} of ${database}: ${resource.html_url}`);
        // TODO: Page on-call, open a ticket
        break;

      case 'deploy_request.opened':
      case 'deploy_request.queued':
      case 'deploy_request.in_progress':
        console.log(
          `${event}: deploy request #${resource.number} ` +
          `(${resource.branch} -> ${resource.into_branch}) on ${database}`
        );
        // TODO: Notify reviewers, update the linked ticket or CI status
        break;

      case 'backup.failed':
        console.log(`Backup ${resource.name} failed on ${database}`);
        // TODO: Alert the team
        break;

      case 'backup.succeeded':
        console.log(`Backup ${resource.name} succeeded on ${database}`);
        // TODO: Record backup health
        break;

      case 'cluster.storage':
        console.log(`Storage at ${resource.storage_percentage}% on ${resource.branch_name} (${database})`);
        // TODO: Capacity alert
        break;

      case 'database.access_request':
        console.log(`PlanetScale access request (${resource.state}) on ${database}`);
        // TODO: Notify database admins to review it
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 quickly: PlanetScale waits 2 seconds, then marks the delivery failed
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPlanetScaleWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/planetscale`);
  });
}
