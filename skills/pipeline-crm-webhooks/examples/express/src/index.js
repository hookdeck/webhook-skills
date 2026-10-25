// Generated with: pipeline-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Pipeline CRM signs deliveries with Standard Webhooks (opt-in per endpoint:
// Request signing > Enable signing on the automation's Call an API action):
//   webhook-id         unique delivery ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a Pipeline CRM delivery with the Standard Webhooks library. It
 * checks the timestamp (fixed 5-minute window), recomputes the HMAC over the
 * raw body, and compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the ORIGINAL webhook-timestamp, so this
 * library rejects them after 5 minutes. See references/verification.md for a
 * manual verifier where the window can be dropped or widened.
 *
 * @param {string} rawBody - the exact body Pipeline CRM sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the whsec_ secret from Enable signing
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyPipelineCrmWebhook(rawBody, headers, secret = process.env.PIPELINE_CRM_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The payload carries no event ID, so dedupe on the webhook-id header.
const processedDeliveryIds = new Set();

function handleEvent(event) {
  // The body has no event type string; combine event_model and event_action.
  const eventType = `${event.event_model}.${event.event_action}`;
  const data = event.event_data || {};

  switch (eventType) {
    case 'deal.create':
      console.log(`Deal created: ${event.event_model_id} (${data.name})`);
      break;
    case 'deal.update':
      // event_changes maps each changed field to [old, new]
      console.log(`Deal updated: ${event.event_model_id} changes: ${Object.keys(event.event_changes || {}).join(', ')}`);
      break;
    case 'deal.destroy':
      console.log(`Deal deleted: ${event.event_model_id}`);
      break;
    case 'person.create':
      console.log(`Person created: ${event.event_model_id}`);
      break;
    case 'person.update':
      console.log(`Person updated: ${event.event_model_id}`);
      break;
    case 'person.destroy':
      console.log(`Person deleted: ${event.event_model_id}`);
      break;
    case 'company.create':
      console.log(`Company created: ${event.event_model_id}`);
      break;
    case 'company.update':
      console.log(`Company updated: ${event.event_model_id}`);
      break;
    case 'company.destroy':
      console.log(`Company deleted: ${event.event_model_id}`);
      break;
    default:
      console.log(`Unhandled Pipeline CRM event: ${eventType}`);
  }
}

// Pipeline CRM webhook endpoint. express.raw() keeps the exact bytes for the
// HMAC whatever the content type; express.json() would re-serialise the body
// and break verification.
app.post('/webhooks/pipeline-crm', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.PIPELINE_CRM_WEBHOOK_SECRET) {
    console.error('PIPELINE_CRM_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  // Signing is opt-in; unsigned deliveries have no webhook-* headers.
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers (is signing enabled?)' });
  }

  let event;
  try {
    event = verifyPipelineCrmWebhook(Buffer.from(req.body).toString('utf8'), headers);
  } catch (err) {
    console.error('Pipeline CRM webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Pipeline CRM expects a 2xx within a few seconds. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Pipeline CRM event:', err);
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
    console.log(`Pipeline CRM webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pipeline-crm`);
  });
}

module.exports = { app, server, verifyPipelineCrmWebhook };
