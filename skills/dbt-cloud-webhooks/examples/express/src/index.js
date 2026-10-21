// Generated with: dbt-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a dbt Cloud webhook.
 *
 * dbt Cloud puts the bare lowercase hex HMAC-SHA256 of the raw request body in
 * the `Authorization` header (no scheme, no "Bearer"), keyed with the webhook's
 * secret (`hmac_secret`) used as a raw UTF-8 string.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} authHeader - the Authorization header value
 * @param {string} secret - the webhook's hmac_secret
 * @returns {boolean}
 */
function verifyDbtCloudSignature(rawBody, authHeader, secret) {
  if (!authHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; guard the length first because timingSafeEqual throws on mismatch
  const received = Buffer.from(authHeader.trim());
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

// dbt Cloud webhook endpoint - must use the raw body for signature verification
app.post(
  '/webhooks/dbt-cloud',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(400).send('Missing Authorization header');
    }

    if (!verifyDbtCloudSignature(req.body, authHeader, process.env.DBT_CLOUD_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Signature is valid - safe to parse the event
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // eventId is unique per event: use it to dedupe retries
    // (job.run.errored is a subset of job.run.completed, so one failed run can notify twice)
    switch (event.eventType) {
      case 'job.run.started':
        console.log('Run started:', event.data?.runId, event.data?.jobName);
        // TODO: Post to chat, mark the pipeline as in progress, etc.
        break;

      case 'job.run.completed':
        console.log('Run completed:', event.data?.runId, event.data?.runStatus);
        // TODO: Fetch artifacts, trigger downstream jobs, refresh dashboards, etc.
        break;

      case 'job.run.errored':
        console.log('Run errored:', event.data?.runId, event.data?.runStatusMessage);
        // TODO: Page on-call, open a ticket, etc. (artifacts may not be ingested yet)
        break;

      default:
        console.log(`Unhandled event type: ${event.eventType}`);
    }

    // Return 2xx quickly: dbt times out after 10 seconds
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyDbtCloudSignature = verifyDbtCloudSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/dbt-cloud`);
  });
}
