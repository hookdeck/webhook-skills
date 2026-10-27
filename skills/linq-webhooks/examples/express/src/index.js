// Generated with: linq-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Linq delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique event identifier
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the subscription's secret after its `whsec_` prefix.
// Each webhook subscription has its own signing secret.
// Hookdeck's Linq source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
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
 * Verify a Linq delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body Linq sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the subscription's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyLinqWebhook(rawBody, headers, secret = process.env.LINQ_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// event_id is the same on every retry and on every subscription.
const processedEventIds = new Set();

function handleEvent(event) {
  const { event_type: type, data = {} } = event;

  switch (type) {
    // --- Messages ----------------------------------------------------------
    case 'message.received':
      // Inbound message. parts[] holds text and attachments.
      console.log(`Message ${data.id} received in chat ${data.chat?.id} from ${data.sender_handle?.handle}`);
      break;
    case 'message.sent':
      console.log(`Message ${data.id} sent in chat ${data.chat?.id}`);
      break;
    case 'message.delivered':
    case 'message.read':
      // Not sent for SMS/MMS, so a missing delivered event there is normal.
      console.log(`${type}: message ${data.id}`);
      break;
    case 'message.failed':
      // Branch on `code`; `detail_code` is opaque and for support requests only.
      console.log(`Message ${data.message_id} failed (code ${data.code}): ${data.reason}`);
      break;
    case 'message.edited':
      console.log(`Message ${data.id} edited at ${data.edited_at}`);
      break;

    // --- Reactions ---------------------------------------------------------
    case 'reaction.added':
    case 'reaction.removed':
      console.log(`${type}: ${data.reaction_type} on message ${data.message_id} from ${data.from}`);
      break;

    // --- Chats and participants -------------------------------------------
    case 'chat.created':
      console.log(`Chat created: ${data.id} (group: ${data.is_group})`);
      break;
    case 'participant.added':
    case 'participant.removed':
      console.log(`${type}: ${data.handle} in chat ${data.chat_id}`);
      break;

    // --- Phone numbers -----------------------------------------------------
    case 'phone_number.status_updated':
      console.log(
        `Phone ${data.phone_number}: status ${data.previous_status} -> ${data.new_status}, ` +
          `reputation ${data.previous_reputation} -> ${data.new_reputation}`
      );
      break;

    default:
      // Linq documents 76 event types; subscribe only to the ones you handle.
      console.log(`Unhandled Linq event type: ${type}`);
  }
}

// Linq webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break
// verification.
app.post('/webhooks/linq', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.LINQ_WEBHOOK_SECRET) {
    console.error('LINQ_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyLinqWebhook(req.body, headers);
  } catch (err) {
    console.error('Linq webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const eventId = event.event_id;
  if (eventId && processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Linq times out after 10 seconds. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Linq event:', err);
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
    console.log(`Linq webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/linq`);
  });
}

module.exports = { app, server, verifyLinqWebhook, resolveSignatureHeaders };
