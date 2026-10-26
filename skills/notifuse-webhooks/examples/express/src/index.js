// Generated with: notifuse-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Notifuse signs webhooks per Standard Webhooks:
//   webhook-id         unique delivery ID
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the subscription's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers. Notifuse sends webhook-*; if webhook-id is
 * absent, fall back to the svix-* names (what Hookdeck does too). The result
 * always uses the webhook-* names the standardwebhooks library expects.
 *
 * @param {(name: string) => string | undefined} get - header lookup
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
 * Verify a delivery with the Standard Webhooks library. It enforces a fixed
 * 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. Note that Hookdeck
 * retries and replays resend the original timestamp, so late retries fail the
 * window; see references/verification.md for a manual verifier without it.
 *
 * @param {string} rawBody - the exact body Notifuse sent
 * @param {object} headers - webhook-id/-timestamp/-signature
 * @param {string} secret - the subscription's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyNotifuseWebhook(rawBody, headers, secret = process.env.NOTIFUSE_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header: Notifuse may rarely deliver twice.
const processedDeliveryIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Contacts ----------------------------------------------------------
    case 'contact.created':
    case 'contact.updated':
    case 'contact.deleted':
      console.log(`${type}: ${data.email} (${data.id})`);
      break;

    // --- Lists (one delivery per contact per list event) -------------------
    case 'list.subscribed':
    case 'list.unsubscribed':
    case 'list.confirmed':
    case 'list.resubscribed':
    case 'list.bounced':
    case 'list.complained':
    case 'list.pending':
    case 'list.removed':
      console.log(`${type}: ${data.email}`);
      break;

    // --- Segments ----------------------------------------------------------
    case 'segment.joined':
    case 'segment.left':
      console.log(`${type}: ${data.email} / ${data.segment_name} (${data.segment_id})`);
      break;

    // --- Emails ------------------------------------------------------------
    case 'email.sent':
    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
    case 'email.bounced':
    case 'email.complained':
    case 'email.unsubscribed':
      console.log(`${type}: ${data.message_id} to ${data.email} ("${data.subject}")`);
      break;

    // --- Custom events -----------------------------------------------------
    case 'custom_event.created':
    case 'custom_event.updated':
    case 'custom_event.deleted':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Notifuse event type: ${type}`);
  }
}

// Notifuse webhook endpoint. express.raw() with type '*/*' keeps the exact
// bytes for the HMAC whatever the content type; express.json() would
// re-serialise the body and break verification.
app.post('/webhooks/notifuse', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.NOTIFUSE_WEBHOOK_SECRET) {
    console.error('NOTIFUSE_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyNotifuseWebhook(Buffer.from(req.body).toString('utf8'), headers);
  } catch (err) {
    console.error('Notifuse webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Notifuse needs a 2xx within 30 seconds. In production, enqueue the
    // event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Notifuse event:', err);
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
    console.log(`Notifuse webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/notifuse`);
  });
}

module.exports = { app, server, verifyNotifuseWebhook, signatureHeaders };
