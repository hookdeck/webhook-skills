// Generated with: epilot-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// epilot signs webhooks per Standard Webhooks:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the request was signed
//   webhook-signature  space-separated entries: "v1a,<Ed25519> v1,<HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the webhook's secret after its `whsec_` prefix.
// The v1a (Ed25519) entry is ignored here; the v1 entry proves the request
// was made for your webhook. Each webhook config has its own secret.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers. epilot sends webhook-*; when webhook-id is
 * absent, fall back to the svix-* names (as Hookdeck does). The result uses the
 * webhook-* names the standardwebhooks library expects.
 *
 * @param {(name: string) => string | undefined} get - case-insensitive header getter
 * @returns {object | null} null when any header is missing
 */
function resolveSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const id = get(`${prefix}-id`);
  const timestamp = get(`${prefix}-timestamp`);
  const signature = get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': signature,
  };
}

/**
 * Verify an epilot delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry. Other versions,
 * such as epilot's `v1a` Ed25519 entry, are skipped.
 *
 * @param {string} rawBody - the exact body epilot sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {Error} if verification fails or the body is not JSON
 */
function verifyEpilotWebhook(rawBody, headers, secret = process.env.EPILOT_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers, { jsonParse: false }); // throws on failure
  return rawBody ? JSON.parse(rawBody) : {}; // a bodiless (e.g. GET) delivery is verified over zero bytes
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is stable across retries of the same message.
const processedMessageIds = new Set();

// The event name is per organization. The default payload carries it in
// metadata.event_type; Event Catalog payloads (file events) use _event_name.
// metadata.webhook_id identifies the webhook config, i.e. one eventName.
function eventName(event) {
  return event.metadata?.event_type || event._event_name || null;
}

function handleEvent(event) {
  const name = eventName(event);
  const entity = event.entity || {};

  switch (name) {
    case 'automation_trigger_webhook':
      console.log(`Automation trigger: ${entity._schema_} ${entity._id} (webhook ${event.metadata?.webhook_id})`);
      break;
    case 'customer_request_created':
      console.log(`Customer request created: ${entity._schema_} ${entity._id}`);
      break;
    case 'FileCreated':
    case 'event_FileCreated': {
      // Event Catalog envelope; files are listed in event_attachments.
      const files = (event.event_attachments || []).map((f) => f.filename).join(', ');
      console.log(`File created in org ${event._org_id}: ${files}`);
      break;
    }
    default:
      console.log(`Unhandled epilot event: ${name} (webhook ${event.metadata?.webhook_id})`);
  }
}

// epilot webhook endpoint. express.raw() with '*/*' keeps the exact bytes for
// the HMAC whatever the content type; express.json() would re-serialise the
// body and break verification. Parse only after the check.
// Each epilot webhook config sets its own httpMethod, so accept all of them.
app.all('/webhooks/epilot', express.raw({ type: '*/*' }), (req, res) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).set('Allow', 'GET, POST, PUT, PATCH, DELETE').json({ error: 'Method not allowed' });
  }

  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.EPILOT_WEBHOOK_SECRET) {
    console.error('EPILOT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyEpilotWebhook(Buffer.from(req.body || '').toString('utf8'), headers);
  } catch (err) {
    console.error('epilot webhook verification failed:', err.message);
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
    console.error('Error handling epilot event:', err);
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
    console.log(`epilot webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/epilot (GET, POST, PUT, PATCH, DELETE)`);
  });
}

module.exports = { app, server, verifyEpilotWebhook, resolveSignatureHeaders };
