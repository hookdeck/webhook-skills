// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Basiq signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique message ID (same if the message is resent)
//   webhook-timestamp  Unix seconds of the attempt
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each Basiq webhook subscription has its own signing secret.
// ---------------------------------------------------------------------------

/**
 * Pick the header set. Hookdeck's Basiq source reads webhook-* and falls back
 * to svix-* when webhook-id is absent; do the same, then hand the library the
 * values under the webhook-* names it expects.
 */
function signatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
}

/**
 * Verify a Basiq delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. Hookdeck retries and
 * replays resend the ORIGINAL timestamp, so late ones fail here; see
 * references/verification.md for a manual verifier with a configurable window.
 *
 * @param {string} rawBody - the exact body Basiq sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the subscription's whsec_ signing secret
 * @throws {Error} if verification fails
 */
function verifyBasiqWebhook(rawBody, headers, secret = process.env.BASIQ_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id stays the same if Basiq resends a message.
const processedMessageIds = new Set();

// Basiq notifications are thin: eventTypeId, eventId and links. Fetch the
// event or the affected object from links.event / links.eventEntity with your
// Basiq API token to get the data.
function handleEvent(event) {
  const { eventTypeId, eventId, links = {} } = event;

  switch (eventTypeId) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'connection.created':
    case 'connection.activated':
    case 'connection.invalidated':
    case 'connection.deleted':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'consent.created':
    case 'consent.updated':
    case 'consent.revoked':
    case 'consent.expired':
    case 'consent.reminder':
    case 'consent.warning':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'account.updated':
      console.log(`Account updated: ${links.eventEntity} (event ${eventId})`);
      break;
    case 'transactions.updated':
      console.log(`Transactions updated: ${links.eventEntity} (event ${eventId})`);
      break;

    default:
      console.log(`Unhandled Basiq event type: ${eventTypeId}`);
  }
}

// Basiq webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/basiq', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BASIQ_WEBHOOK_SECRET) {
    console.error('BASIQ_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  try {
    verifyBasiqWebhook(rawBody, headers);
  } catch (err) {
    console.error('Basiq webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Verified: only now parse the body.
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // A resent message reuses the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Basiq event:', err);
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
    console.log(`Basiq webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/basiq`);
  });
}

module.exports = { app, server, verifyBasiqWebhook, signatureHeaders };
