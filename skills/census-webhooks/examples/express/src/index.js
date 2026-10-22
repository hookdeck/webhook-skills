require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Census (Fivetran Activations) webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Signature header value
 * @param {string} secret - One-time secret shown when the webhook was created
 * @returns {boolean} - Whether signature is valid
 */
function verifyCensusWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Standard base64 HMAC-SHA256 of the raw body, keyed with the secret's raw bytes
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim()), Buffer.from(expected));
  } catch {
    return false; // Different lengths = invalid
  }
}

// Census webhook endpoint - must use raw body for signature verification.
// type: '*/*' reads the raw bytes whatever Content-Type the sender uses.
app.post('/webhooks/census',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CENSUS_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CENSUS_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-signature'];
    if (!signature) {
      return res.status(400).send('Missing X-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyCensusWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event type is in the body (`event`), not a header
    const { event, sync_id: syncId, sync_run_id: syncRunId } = payload;
    console.log(`Received ${event} event (sync ${syncId}, run ${syncRunId})`);

    switch (event) {
      case 'sync.triggered':
        console.log(`Sync run ${syncRunId} queued`);
        break;

      case 'sync.started':
        console.log(`Sync run ${syncRunId} started`);
        // TODO: Mark the run as in progress
        break;

      case 'sync.completed':
        // Fires for successful and failed runs: status is "ok" or "emergency"
        console.log(`Sync run ${syncRunId} completed with status ${payload.status}`);
        break;

      case 'sync.success':
        console.log(`Sync run ${syncRunId} succeeded`);
        // TODO: Kick off downstream jobs that depend on the synced data
        break;

      case 'sync.failed':
        console.log(`Sync run ${syncRunId} failed`);
        // TODO: Page on-call or open a ticket
        break;

      case 'sync.alert.raised':
        console.log(`Alert raised (${payload.alert_type}): ${payload.message} - ${payload.details}`);
        // TODO: Route to your alerting tool; payload.followup_url links to the sync history
        break;

      case 'sync.alert.resolved':
        console.log(`Alert resolved (${payload.alert_type}): ${payload.message}`);
        break;

      default:
        console.log(`Unhandled event: ${event}`);
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
module.exports = { app, verifyCensusWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/census`);
  });
}
