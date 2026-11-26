// Generated with: loops-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Loops signs webhooks with three headers:
//   Webhook-Id         unique event ID, use it to skip duplicate deliveries
//   Webhook-Timestamp  seconds since epoch
//   Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
//                      (old and new secret both sign for 24h after a roll)
// Signed content: `${Webhook-Id}.${Webhook-Timestamp}.${rawBody}`
// Key: the signing secret from Settings -> Webhooks with an optional whsec_
// prefix stripped, then base64-DECODED (as in Loops' own example).
// ---------------------------------------------------------------------------

/**
 * Verify a Loops delivery.
 *
 * @param {Buffer|string} rawBody - the exact bytes Loops sent
 * @param {object} headers - lower-cased webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - LOOPS_WEBHOOK_SECRET
 * @param {number|null} toleranceSeconds - optional freshness window; null = off.
 *   Loops' example enforces 300 seconds. A delivery replayed later through a
 *   relay or queue keeps its original timestamp, so a window rejects it.
 *   Dedupe on webhook-id either way.
 * @returns {boolean}
 */
function verifyLoopsWebhook(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  // After a secret roll the header carries one signature per secret.
  // Check every v1 entry; any match passes.
  let ok = false;
  for (const entry of signatureHeader.trim().split(/\s+/)) {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) continue;
    const given = Buffer.from(signature, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set();

/**
 * Every body has eventName, eventTime (Unix seconds) and webhookSchemaVersion.
 * Workflows were called Loops until May 2026; payloads keep the loop names
 * (loop.email.sent, loopId, sourceType "loop").
 */
function handleEvent(event) {
  const who = event.contactIdentity ? event.contactIdentity.email : undefined;
  switch (event.eventName) {
    case 'contact.created':
      console.log(`Contact created: ${who}`);
      break;
    case 'contact.unsubscribed':
    case 'contact.deleted':
      console.log(`${event.eventName}: ${who}`);
      break;
    case 'contact.mailingList.subscribed':
    case 'contact.mailingList.unsubscribed':
      console.log(`${event.eventName}: ${who} ${event.mailingList && event.mailingList.name}`);
      break;
    case 'campaign.email.sent':
    case 'loop.email.sent':
    case 'transactional.email.sent':
      console.log(`${event.eventName} to ${who}: ${event.email && event.email.subject}`);
      break;
    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
      console.log(`${event.eventName} (${event.sourceType}) for ${who}`);
      break;
    case 'email.softBounced':
    case 'email.hardBounced':
    case 'email.spamReported':
    case 'email.unsubscribed':
    case 'email.resubscribed':
      // Deliverability and consent signals: update your own records.
      console.log(`${event.eventName} (${event.sourceType}) for ${who}`);
      break;
    case 'testing.testEvent':
      // Sent by "send test request" on the Webhooks settings page.
      console.log(`Loops test event: ${event.message}`);
      break;
    default:
      console.log(`Unhandled Loops event: ${event.eventName}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/loops', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LOOPS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOOPS_WEBHOOK_SECRET is not set: rejecting delivery');
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

  const tolerance = process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.LOOPS_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verifyLoopsWebhook(req.body, headers, secret, tolerance)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The same event can be sent more than once: skip a Webhook-Id already seen.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Respond within 15 seconds: verify, enqueue, return 2xx, work asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Loops event:', err);
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
    console.log(`Loops webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/loops`);
  });
}

module.exports = { app, server, verifyLoopsWebhook };
