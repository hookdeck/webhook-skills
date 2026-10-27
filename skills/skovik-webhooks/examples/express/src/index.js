// Generated with: skovik-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Skovik delivers webhooks with Standard Webhooks signatures:
//   webhook-id         delivery id, the same on every retry of a delivery
//   webhook-timestamp  Unix seconds when this attempt was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each webhook endpoint has its own signing secret.
// Hookdeck's Skovik source also accepts the svix-* header names when
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
 * Verify a Skovik delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body Skovik sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySkovikWebhook(rawBody, headers, secret = process.env.SKOVIK_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// data.id is the event id: the same on every retry and on every endpoint.
const processedEventIds = new Set();

function handleEvent(event) {
  // The delivery is a thin notification: the related resource is only linked.
  // Fetch its current state from the `related` URL instead of trusting a snapshot.
  const { type, data = {} } = event;
  const related = data.relationships?.related_object;
  const resource = related?.data ? `${related.data.type}/${related.data.id}` : 'no related resource';

  switch (type) {
    // --- Users -------------------------------------------------------------
    case 'users.created':
    case 'users.updated':
    case 'users.archived':
      console.log(`${type}: ${resource}`);
      break;

    // --- Export orders -----------------------------------------------------
    case 'export_orders.created':
      console.log(`Export order created: ${resource}`);
      break;
    case 'export_orders.completed':
      // Fetch the export order to get the URL of the export file.
      console.log(`Export order completed: ${resource}`);
      break;
    case 'export_orders.failed':
      // Fetch the export order and read its `error_message` attribute.
      console.log(`Export order failed: ${resource}`);
      break;

    // --- Branches ----------------------------------------------------------
    case 'branches.created':
    case 'branches.updated':
    case 'branches.archived':
      console.log(`${type}: ${resource}`);
      break;

    // --- Test event --------------------------------------------------------
    case 'misc.ping':
      // Sent from the settings UI to test an endpoint. It is signed like any
      // other delivery, is never retried, and has no related resource.
      console.log('Skovik ping received');
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Skovik event type: ${type}`);
  }
}

// Skovik webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break
// verification. The body is parsed only after the signature check passes.
app.post('/webhooks/skovik', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SKOVIK_WEBHOOK_SECRET) {
    console.error('SKOVIK_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifySkovikWebhook(req.body, headers);
  } catch (err) {
    console.error('Skovik webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const eventId = event.data?.id;
  if (eventId && processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Skovik times out after 5 seconds. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Skovik event:', err);
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
    console.log(`Skovik webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/skovik`);
  });
}

module.exports = { app, server, verifySkovikWebhook, resolveSignatureHeaders };
