// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Argil signs webhooks per Standard Webhooks:
//   webhook-id         event ID (stable across retries)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix, returned once
// by POST /webhooks. The body is `{ event, data }` with SCREAMING_SNAKE events.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers. `webhook-*` is the documented prefix; if
 * `webhook-id` is absent, fall back to `svix-*` (same scheme, other prefix).
 * Returns the values under the names the standardwebhooks library expects.
 */
function signatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const headers = {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
  return headers['webhook-id'] && headers['webhook-timestamp'] && headers['webhook-signature']
    ? headers
    : null;
}

/**
 * Verify an Argil delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Retries and replays (for example from Hookdeck) keep the original timestamp,
 * so this rejects them after 5 minutes. See references/verification.md for a
 * manual verifier without the window.
 *
 * @param {string} rawBody - the exact body Argil sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the whsec_ secret returned when the webhook was created
 * @returns {object} the parsed, verified `{ event, data }` payload
 * @throws {Error} if verification fails
 */
function verifyArgilWebhook(rawBody, headers, secret = process.env.ARGIL_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Deliveries are at least once; webhook-id is the same on every retry.
const processedEventIds = new Set();

function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'VIDEO_GENERATION_SUCCESS':
      console.log(`Video ready: ${data.videoId} (${data.videoName}) ${data.videoUrl} cost ${data.renderCost}`);
      break;
    case 'VIDEO_GENERATION_FAILED':
      console.log(
        `Video failed: ${data.videoId}: ${data.message} (cost ${data.renderCost}, refunded ${data.renderCostRefunded})`
      );
      break;
    case 'AVATAR_TRAINING_SUCCESS':
      console.log(`Avatar trained: ${data.avatarId} (${data.avatarName}) voice ${data.voiceId}`);
      break;
    case 'AVATAR_TRAINING_FAILED':
      console.log(`Avatar training failed: ${data.avatarId} (${data.avatarName})`);
      break;
    default:
      console.log(`Unhandled Argil event: ${event}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would
// re-serialise the body and break verification.
app.post('/webhooks/argil', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ARGIL_WEBHOOK_SECRET) {
    console.error('ARGIL_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({
      error:
        'Missing Standard Webhooks signature headers. Webhooks created before Argil added signing are unsigned: recreate the webhook to get a whsec_ secret.',
    });
  }

  let payload;
  try {
    payload = verifyArgilWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Argil webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Argil needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(payload);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Argil event:', err);
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
    console.log(`Argil webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/argil`);
  });
}

module.exports = { app, server, verifyArgilWebhook, signatureHeaders };
