// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Basiq signs webhooks with Standard Webhooks:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a Basiq delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute window), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * The fixed window rejects Hookdeck retries and replays older than 5 minutes
 * (they resend the original timestamp). For a configurable window, see the
 * manual verifier in references/verification.md.
 *
 * @param {string} rawBody - the exact body Basiq sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyBasiqWebhook(rawBody, headers, secret = process.env.BASIQ_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header.
const processedMessageIds = new Set();

// Basiq notifications are thin: { eventTypeId, eventId, links: { event, eventEntity } }.
// Fetch links.event / links.eventEntity with your Basiq API token for the data.
function handleEvent(event) {
  const type = event.eventTypeId;
  const entity = event.links?.eventEntity ?? 'unknown';

  switch (type) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`${type}: ${entity}`);
      break;
    case 'connection.created':
    case 'connection.activated':
    case 'connection.invalidated':
    case 'connection.deleted':
      console.log(`${type}: ${entity}`);
      break;
    case 'consent.created':
    case 'consent.updated':
    case 'consent.warning':
    case 'consent.reminder':
    case 'consent.expired':
    case 'consent.revoked':
      console.log(`${type}: ${entity}`);
      break;
    case 'account.updated':
    case 'transactions.updated':
      console.log(`${type}: ${entity}`);
      break;
    default:
      console.log(`Unhandled Basiq event type: ${type}`);
  }
}

// Basiq webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes for
// the HMAC for any content type; express.json() would re-serialise the body and
// break it. The body is parsed only after verification succeeds.
app.post('/webhooks/basiq', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BASIQ_WEBHOOK_SECRET) {
    console.error('BASIQ_WEBHOOK_SECRET is not set; rejecting delivery');
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
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let event;
  try {
    event = verifyBasiqWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Basiq webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are possible; acknowledge with 200.
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

module.exports = { app, server, verifyBasiqWebhook };
