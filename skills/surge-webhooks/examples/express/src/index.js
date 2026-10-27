// Generated with: surge-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Surge delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique id for the delivery
//   webhook-timestamp  Unix seconds when the event was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Hookdeck's Surge source also accepts the svix-* header names when
// webhook-id is absent, so this handler does the same.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const id = get(`${prefix}-id`);
  const timestamp = get(`${prefix}-timestamp`);
  const signature = get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a Surge delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body Surge sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySurgeWebhook(rawBody, headers, secret = process.env.SURGE_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Envelope: {id, type, timestamp, account_id, data}. Some of Surge's examples
// omit `id`, so fall back to type + data.id.
const processedEventKeys = new Set();

function eventKey(event) {
  if (event.id) return event.id;
  return event.data?.id ? `${event.type}:${event.data.id}` : null;
}

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Messages ----------------------------------------------------------
    case 'message.received':
      // Reply with POST /accounts/{account_id}/messages and conversation.id.
      console.log(`Inbound message ${data.id} in ${data.conversation?.id}: ${data.body}`);
      break;
    case 'message.sent':
      console.log(`Message sent to carrier: ${data.id}`);
      break;
    case 'message.delivered':
      console.log(`Message delivered: ${data.id}`);
      break;
    case 'message.failed':
      // opted_out and invalid_mobile_number are permanent; carrier_error is transient.
      console.log(`Message failed: ${data.id} (${data.failure_reason})`);
      break;

    // --- Contacts and conversations ----------------------------------------
    case 'contact.opted_in':
      console.log(`Contact opted in: ${data.id}`);
      break;
    case 'contact.opted_out':
      // Suppress this contact in your own systems.
      console.log(`Contact opted out: ${data.id}`);
      break;
    case 'conversation.created':
      console.log(`Conversation created: ${data.id}`);
      break;

    // --- Campaigns and phone numbers ---------------------------------------
    case 'campaign.approved':
      console.log(`Campaign approved: ${data.id}`);
      break;
    case 'phone_number.imported':
      console.log(`Phone number imported: ${data.id} (${data.campaign?.attachment_status ?? 'no campaign'})`);
      break;
    case 'phone_number.attached_to_campaign':
      console.log(`Phone number attached to campaign: ${data.id}`);
      break;

    // --- Links -------------------------------------------------------------
    case 'link.followed':
      // data.message_id is deprecated; use data.message.id.
      console.log(`Link followed in message ${data.message?.id}`);
      break;

    // --- Voice -------------------------------------------------------------
    case 'call.ended':
      console.log(`Call ended: ${data.id}`);
      break;
    case 'recording.completed':
    case 'voicemail.received':
      // Download the audio with GET /recordings/{recording_id}/file.
      console.log(`${type}: ${data.id}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Surge event type: ${type}`);
  }
}

// Surge webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break
// verification. The body is parsed only after the signature check passes.
app.post('/webhooks/surge', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SURGE_WEBHOOK_SECRET) {
    console.error('SURGE_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifySurgeWebhook(req.body, headers);
  } catch (err) {
    console.error('Surge webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const key = eventKey(event);
  if (key && processedEventKeys.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Return 2xx quickly. In production, enqueue the event here and process
    // it asynchronously.
    handleEvent(event);
    if (key) processedEventKeys.add(key);
  } catch (err) {
    console.error('Error handling Surge event:', err);
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
    console.log(`Surge webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/surge`);
  });
}

module.exports = { app, server, verifySurgeWebhook, resolveSignatureHeaders, eventKey };
