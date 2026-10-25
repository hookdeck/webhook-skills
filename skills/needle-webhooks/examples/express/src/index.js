// Generated with: needle-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Needle signs webhooks with Standard Webhooks headers:
//   webhook-id         the event id (same value when a request is sent again)
//   webhook-timestamp  Unix seconds when this request was sent
//   webhook-signature  "v1,<base64 signature>" (one or more, space-separated)
// Signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256,
// keyed with the base64-decoded part of the `whsec_` secret after the prefix.
//
// Body: { version: 'v1', id, type, timestamp, data } where `data` is the event.
// ---------------------------------------------------------------------------

/**
 * Verify a Needle delivery with the Standard Webhooks library. It rejects
 * timestamps more than 5 minutes off (fixed), recomputes the HMAC over the raw
 * body, and compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries/replays resend the ORIGINAL timestamp, so a late one fails
 * here (Needle's own retries carry a fresh timestamp). See references/verification.md for a manual verifier
 * where the window can be dropped or widened.
 *
 * @param {string} rawBody - the exact body Needle sent
 * @param {object} headers - webhook-id, webhook-timestamp, webhook-signature
 * @param {string} secret - the webhook's whsec_ secret
 * @returns {object} the parsed, verified body
 * @throws {Error} if verification fails
 */
function verifyNeedleWebhook(rawBody, headers, secret = process.env.NEEDLE_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// A resend keeps the same webhook-id.
const processedMessageIds = new Set();

function handleEvent(body) {
  const { type, id, data } = body;

  switch (type) {
    case 'lead_created':
      console.log(`Lead created: ${data.leadName || data.leadId} (${data.leadEmail || 'no email'}, event ${id})`);
      break;

    case 'lead_updated':
      // data.data.changes lists each changed field
      console.log(`Lead updated: ${data.leadId} (event ${id})`);
      break;

    case 'linkedin_message_received':
      // A reply: route it to a human and stop automated follow-ups
      console.log(`LinkedIn reply from ${data.leadName || data.leadId}: ${data.data && data.data.text} (event ${id})`);
      break;

    case 'enrollment_completed':
      console.log(`Enrollment ${data.enrollmentId} completed in campaign ${data.campaignId} (event ${id})`);
      break;

    case 'campaign_status_changed':
      console.log(`Campaign ${data.campaignId} status changed: ${data.data && data.data.message} (event ${id})`);
      break;

    case 'account_disconnected':
      // The account needs signing in again; its campaigns wait until it does
      console.log(`Account ${data.connectedAccountId} disconnected: ${data.data && data.data.errorKind} (event ${id})`);
      break;

    default:
      // Needle adds event types over time: ignore ones you don't know
      console.log(`Unhandled Needle event type: ${type}`);
  }
}

// Needle webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/needle', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.NEEDLE_WEBHOOK_SECRET) {
    console.error('NEEDLE_WEBHOOK_SECRET is not set, rejecting delivery');
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

  let body;
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    body = verifyNeedleWebhook(rawBody, headers);
  } catch (err) {
    console.error('Needle webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // A resend keeps the webhook-id, so acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Answer within 10 seconds. In production, enqueue here and process asynchronously.
    handleEvent(body);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Needle event:', err);
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
    console.log(`Needle webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/needle`);
  });
}

module.exports = { app, server, verifyNeedleWebhook };
