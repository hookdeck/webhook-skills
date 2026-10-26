// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Argil signs webhooks per Standard Webhooks:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Webhooks created before Argil added signing are unsigned: recreate them.
// ---------------------------------------------------------------------------

/**
 * Verify an Argil delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body, compares in constant time against every `v1,`
 * entry and enforces a fixed 5-minute timestamp window. Hookdeck retries and
 * replays resend the original timestamp, so late ones fail here: see the
 * manual verifier in references/verification.md to drop or widen the window.
 *
 * @param {string} rawBody - the exact body Argil sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the whsec_ secret returned when the webhook was created
 * @returns {object} the parsed, verified {event, data} body
 * @throws {Error} if verification fails
 */
function verifyArgilWebhook(rawBody, headers, secret = process.env.ARGIL_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at-least-once and the body has no event ID: dedupe on webhook-id.
const processedMessageIds = new Set();

function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'VIDEO_GENERATION_SUCCESS':
      console.log(`Video ready: ${data.videoId} (${data.videoName}) ${data.videoUrl}, cost ${data.renderCost}`);
      break;
    case 'VIDEO_GENERATION_FAILED':
      console.log(`Video failed: ${data.videoId} (${data.message}), refunded ${data.renderCostRefunded}`);
      break;
    case 'AVATAR_TRAINING_SUCCESS':
      console.log(`Avatar trained: ${data.avatarId} (${data.avatarName})`);
      break;
    case 'AVATAR_TRAINING_FAILED':
      console.log(`Avatar training failed: ${data.avatarId} (${data.avatarName})`);
      break;
    default:
      console.log(`Unhandled Argil event: ${event}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC whatever the content type;
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/argil', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ARGIL_WEBHOOK_SECRET) {
    console.error('ARGIL_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    // Webhooks created before Argil added signing arrive without these headers.
    return res.status(400).json({ error: 'Missing webhook-id, webhook-timestamp or webhook-signature' });
  }

  let payload;
  try {
    payload = verifyArgilWebhook(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', headers);
  } catch (err) {
    console.error('Argil webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Argil needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
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

module.exports = { app, server, verifyArgilWebhook };
