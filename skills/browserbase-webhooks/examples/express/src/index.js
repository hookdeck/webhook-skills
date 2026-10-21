// Generated with: browserbase-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Browserbase signs deliveries with Standard Webhooks:
//   webhook-id         unique message identifier
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// Browserbase returns the secret only when you create or rotate the webhook.
// ---------------------------------------------------------------------------

/**
 * Secrets to try, current first. After a rotation Browserbase keeps the
 * previous secret verifying for 24 hours, so
 * BROWSERBASE_WEBHOOK_SECRET_PREVIOUS is accepted too.
 */
function getSecrets() {
  return [
    process.env.BROWSERBASE_WEBHOOK_SECRET,
    process.env.BROWSERBASE_WEBHOOK_SECRET_PREVIOUS,
  ].filter(Boolean);
}

/**
 * Verify a Browserbase delivery with the official Standard Webhooks SDK.
 * The SDK checks the timestamp (5-minute tolerance), recomputes the HMAC over
 * the raw body, and compares in constant time against every `v1,` entry.
 *
 * @param {Buffer|string} rawBody - the exact bytes Browserbase sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @returns {object} the parsed, verified event
 * @throws {Error} if no configured secret verifies the delivery
 */
function verifyBrowserbaseWebhook(rawBody, headers, secrets = getSecrets()) {
  let lastError = new Error('No signing secret configured');
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(rawBody, headers);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The envelope `id` is stable across retries of the same event.
const processedEventIds = new Set();

function handleEvent(event) {
  // Envelope: { id, type, resourceId, data }. Keys are additive, so ignore
  // anything you don't recognize.
  const { type, resourceId } = event;

  switch (type) {
    // --- Function invocations (resourceId = invocation) ---------------------
    case 'functions.invocations.pending':
      console.log(`Invocation ${resourceId} queued`);
      break;
    case 'functions.invocations.running':
      console.log(`Invocation ${resourceId} running`);
      break;
    case 'functions.invocations.completed':
      // Terminal success: update your record, start downstream work.
      console.log(`Invocation ${resourceId} completed`);
      break;
    case 'functions.invocations.failed':
      // Terminal failure: alert, retry the invocation, or mark the job failed.
      console.log(`Invocation ${resourceId} failed`);
      break;

    // --- Function builds (resourceId = build) -------------------------------
    case 'functions.builds.running':
      console.log(`Build ${resourceId} running`);
      break;
    case 'functions.builds.completed':
      console.log(`Build ${resourceId} completed`);
      break;
    case 'functions.builds.failed':
      console.log(`Build ${resourceId} failed`);
      break;

    default:
      // Browserbase adds event types over time.
      console.log(`Unhandled Browserbase event type: ${type}`);
  }
}

// Browserbase webhook endpoint. express.raw() keeps the exact bytes for the
// HMAC; express.json() would re-serialise the body and break verification.
app.post('/webhooks/browserbase', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (getSecrets().length === 0) {
    console.error('BROWSERBASE_WEBHOOK_SECRET is not set, rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyBrowserbaseWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Browserbase webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Redelivery is normal (retries, or a response that arrived too late).
  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Browserbase needs a 2xx within 15 seconds. In
    // production, store or enqueue the event here and process it afterwards.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Browserbase event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Browserbase webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/browserbase`);
  });
}

module.exports = { app, server, verifyBrowserbaseWebhook };
