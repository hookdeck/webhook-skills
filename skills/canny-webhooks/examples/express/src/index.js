// Generated with: canny-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Canny signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds, covered by the signature
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// The legacy canny-timestamp / canny-nonce / canny-signature headers are
// being removed and don't cover the body: they are ignored here.
// ---------------------------------------------------------------------------

/**
 * Verify a Canny delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body and compares in constant time against every
 * `v1,` entry (two during the 24h after a secret rotation).
 *
 * NOTE: the library always enforces a 5-minute timestamp window. Hookdeck
 * retries and replays resend the original webhook-timestamp, so a delivery
 * retried later than that is rejected. See references/verification.md for a
 * manual verifier with a configurable window.
 *
 * @param {string} rawBody - the exact body Canny sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyCannyWebhook(rawBody, headers, secret = process.env.CANNY_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Canny bodies carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set();

function handleEvent(event) {
  const { type, objectType, object = {} } = event;

  switch (type) {
    // --- Posts -------------------------------------------------------------
    case 'post.created':
      console.log(`Post created: "${object.title}" on ${object.board?.name} (${object.id})`);
      break;
    case 'post.edited':
      console.log(`Post edited: ${object.id}`);
      break;
    case 'post.deleted':
      console.log(`Post deleted: ${object.id}`);
      break;
    case 'post.status_changed':
      console.log(`Post ${object.id} status changed to "${object.status}"`);
      break;
    case 'post.tag_added':
    case 'post.tag_removed':
      console.log(`${type}: ${object.id}`);
      break;
    case 'post.jira_issue_linked':
    case 'post.jira_issue_unlinked':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Comments ----------------------------------------------------------
    case 'comment.created':
    case 'comment.edited':
    case 'comment.deleted':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Votes -------------------------------------------------------------
    case 'vote.created':
    case 'vote.deleted':
      console.log(`${type}: ${object.id}`);
      break;

    default:
      console.log(`Unhandled Canny event type: ${type} (${objectType})`);
  }
}

// Canny webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever Content-Type is sent; express.json() would re-serialise
// the body and break verification.
app.post('/webhooks/canny', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CANNY_WEBHOOK_SECRET) {
    console.error('CANNY_WEBHOOK_SECRET is not set; rejecting delivery');
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
    event = verifyCannyWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Canny webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Canny event:', err);
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
    console.log(`Canny webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/canny`);
  });
}

module.exports = { app, server, verifyCannyWebhook };
