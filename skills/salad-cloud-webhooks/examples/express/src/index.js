// Generated with: salad-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// SaladCloud signs Job Queue webhooks with Standard Webhooks:
//   webhook-id         unique delivery identifier
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret. SaladCloud shows the secret as bare base64
// with no `whsec_` prefix; the library accepts it as is, and also accepts the
// `whsec_`-prefixed form that Hookdeck needs.
// Hookdeck's SaladCloud source also accepts the svix-* header names when
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
 * Verify a SaladCloud delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body SaladCloud sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the webhook secret key, as shown in the portal
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySaladWebhook(rawBody, headers, secret = process.env.SALAD_CLOUD_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body has no event id, so key on the delivery's webhook-id.
const processedDeliveryIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    case 'queue.job.succeeded':
      // data is the job document. data.events[].type are lifecycle steps
      // (created, started, succeeded), not the webhook event.
      console.log(
        `Job ${data.id} ${data.status} in queue ${data.queue_name} ` +
          `(project ${data.project_name}, org ${data.organization_name})`
      );
      break;

    default:
      // Only queue.job.succeeded is documented; failed/cancelled jobs are not covered.
      console.log(`Unhandled SaladCloud event type: ${type}`);
  }
}

// SaladCloud webhook endpoint. express.raw() keeps the exact bytes for the HMAC
// for any content type; express.json() would re-serialise the body and break
// verification.
app.post('/webhooks/salad-cloud', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SALAD_CLOUD_WEBHOOK_SECRET) {
    console.error('SALAD_CLOUD_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifySaladWebhook(req.body, headers);
  } catch (err) {
    console.error('SaladCloud webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Acknowledge repeats of the same delivery with 200.
  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling SaladCloud event:', err);
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
    console.log(`SaladCloud webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/salad-cloud`);
  });
}

module.exports = { app, server, verifySaladWebhook, resolveSignatureHeaders };
