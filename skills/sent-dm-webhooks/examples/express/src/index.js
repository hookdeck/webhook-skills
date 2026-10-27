// Generated with: sent-dm-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Sent (sent.dm) signs webhooks Standard Webhooks / Svix style, but on
// X-Webhook-* header names:
//   X-Webhook-ID         UUID of the webhook configuration (the SAME on every
//                        event, so it is signed but is NOT a dedupe key)
//   X-Webhook-Timestamp  Unix seconds at which this attempt was signed
//   X-Webhook-Signature  "v1,<base64 HMAC-SHA256>" (space-delimited if several)
//   X-Webhook-Event-ID   the event's own UUID, identical on every attempt
// Signed content: `${X-Webhook-ID}.${X-Webhook-Timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a Sent delivery with the Standard Webhooks library. The library reads
 * webhook-* header names, so map Sent's x-webhook-* headers onto them. It
 * rejects timestamps more than 5 minutes off, recomputes the HMAC over the raw
 * body and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Sent sent
 * @param {object} headers - request headers (lowercase names, as Node gives them)
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySentWebhook(rawBody, headers, secret = process.env.SENT_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['x-webhook-id'],
    'webhook-timestamp': headers['x-webhook-timestamp'],
    'webhook-signature': headers['x-webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Sent delivers at-least-once; X-Webhook-Event-ID is the same on every attempt.
const processedEventIds = new Set();

function handleEvent(event) {
  const { event: type } = event; // dispatch on the body's `event` field
  const payload = event.payload ?? {};

  switch (type) {
    case 'message.delivered':
      console.log(`Message delivered: ${payload.message_id} to ${payload.outbound_number} (${payload.channel})`);
      break;
    case 'message.failed':
      console.log(`Message failed: ${payload.message_id} (${payload.reason_code}: ${payload.reason})`);
      break;
    case 'message.received':
      console.log(`Inbound message from ${payload.inbound_number}: ${payload.text}`);
      break;
    case 'templates.approved':
    case 'templates.rejected':
      console.log(`Template ${payload.template_name} ${payload.status}`);
      break;
    case 'contact.opt_out':
      console.log(`Contact opted out: ${payload.contact_id} (${payload.source})`);
      break;
    case 'channel.activated':
      console.log(`Channel activated: ${payload.channel} sender ${payload.sender_value}`);
      break;

    default:
      // Sent documents 38 event types and adds more over time. Acknowledge the rest.
      console.log(`Unhandled Sent event: ${type}`);
  }
}

// Sent webhook endpoint. express.raw() with type '*/*' keeps the exact bytes
// for the HMAC whatever Content-Type arrives; express.json() would
// re-serialise the body and break verification.
app.post('/webhooks/sent-dm', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SENT_WEBHOOK_SECRET) {
    console.error('SENT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(503).json({ error: 'no signing secret configured' });
  }

  if (!req.get('x-webhook-id') || !req.get('x-webhook-timestamp') || !req.get('x-webhook-signature')) {
    return res.status(400).json({ error: 'missing signature headers' });
  }

  let event;
  try {
    event = verifySentWebhook(req.body.toString('utf8'), req.headers);
  } catch (err) {
    console.error('Sent webhook verification failed:', err.message);
    return res.status(401).json({ error: 'invalid signature' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Dedupe on the event's own id, NOT x-webhook-id (that is the webhook's id).
  const eventId = req.get('x-webhook-event-id');
  if (eventId && processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Sent waits up to 30 s by default (5-120 s per webhook) for a 2xx, and
    // disables a webhook after 10 consecutive failures. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Sent event:', err);
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
    console.log(`Sent webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sent-dm`);
  });
}

module.exports = { app, server, verifySentWebhook };
