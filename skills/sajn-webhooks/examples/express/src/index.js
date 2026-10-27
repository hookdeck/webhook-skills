// Generated with: sajn-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// sajn (sajn.se) signs webhooks with Standard Webhooks (API version 2026-10+):
//   webhook-id         the event ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Endpoints on the deprecated 2026-09 API version send X-Sajn-Signature instead.
// ---------------------------------------------------------------------------

const API_VERSION_HINT =
  'Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the ' +
  'deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks ' +
  'and fail verification.';

/**
 * Read the signature headers. Standard Webhooks uses webhook-*; when
 * webhook-id is absent, fall back to the svix-* names, as Hookdeck does.
 * Returns them under the webhook-* names the library expects.
 */
function readSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
}

/**
 * Verify a sajn delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body sajn sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySajnWebhook(rawBody, headers, secret = process.env.SAJN_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The event id is the same on every retry, replay and endpoint.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;
  const object = data.object || {};

  switch (type) {
    // --- Documents ---------------------------------------------------------
    case 'document.sent':
      console.log(`Document sent: ${object.id} (${object.name})`);
      break;
    case 'document.fully_signed':
      // Every party has signed, but the PDF is not sealed yet.
      console.log(`Document fully signed: ${object.id}`);
      break;
    case 'document.completed':
      // The sealed PDF is ready: download the signed file here.
      console.log(`Document completed: ${object.id} (${object.name})`);
      break;
    case 'document.rejected':
    case 'document.expired':
    case 'document.withdrawn':
      console.log(`${type}: ${object.id}`);
      break;
    case 'document.expiring_soon':
      console.log(`Document expiring soon: ${object.id} (expires ${object.expiresAt})`);
      break;

    // --- Parties -----------------------------------------------------------
    case 'document.party.signed':
      console.log(`Party ${data.party?.id} signed document ${object.id}`);
      break;
    case 'document.party.rejected':
      console.log(`Party ${data.party?.id} rejected document ${object.id}`);
      break;
    case 'document.party.delivery_failed':
      // The invitation email bounced or the SMS failed.
      console.log(`Invitation to party ${data.party?.id} failed on document ${object.id}`);
      break;

    // --- Approvals ---------------------------------------------------------
    case 'approval_request.created':
    case 'approval_request.approved':
    case 'approval_request.rejected':
    case 'approval_request.cancelled':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Identity checks ---------------------------------------------------
    case 'identity_check.verified':
      console.log(`Identity check verified: ${object.id}`);
      break;
    case 'identity_check.failed':
      console.log(`Identity check failed: ${object.id} (${data.failureReason})`);
      break;

    // --- Forms, usage, test ------------------------------------------------
    case 'form.submitted':
      console.log(`Form submission: ${object.id}`);
      break;
    case 'usage.limit_reached':
      console.log('sajn usage limit reached');
      break;
    case 'webhook.test':
      console.log(`Test event received for webhook ${object.id}`);
      break;

    default:
      // sajn adds event types without a new API version: acknowledge, don't fail.
      console.log(`Unhandled sajn event type: ${type}`);
  }
}

// sajn webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/sajn', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SAJN_WEBHOOK_SECRET) {
    console.error('SAJN_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = readSignatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    // This also answers the unsigned {"test": true} POST the dashboard sends when you save a webhook.
    const legacy = req.get('x-sajn-signature') ? ` ${API_VERSION_HINT}` : '';
    return res.status(400).json({ error: `Missing Standard Webhooks signature headers.${legacy}` });
  }

  let event;
  try {
    event = verifySajnWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('sajn webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same event id; acknowledge duplicates with 200.
  const eventId = event.id || headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // sajn needs a 2xx within 30 seconds. In production, enqueue the event
    // here and process it asynchronously. Deliveries are unordered: compare
    // event.createdAt before overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling sajn event:', err);
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
    console.log(`sajn webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sajn`);
  });
}

module.exports = { app, server, verifySajnWebhook, readSignatureHeaders };
