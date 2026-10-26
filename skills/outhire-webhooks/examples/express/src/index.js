// Generated with: outhire-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Outhire signs deliveries with Standard Webhooks:
//   webhook-id         unique delivery ID
//   webhook-timestamp  Unix seconds when the request was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Hookdeck also accepts the svix-* spelling of the same three headers, so
// this handler falls back to svix-id / svix-timestamp / svix-signature when
// webhook-id is absent.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers, preferring webhook-* and falling back to
 * svix-* when webhook-id is missing. Returns the values under the names the
 * standardwebhooks library expects, or null if any is missing.
 */
function signatureHeaders(get) {
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
 * Verify an Outhire delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the original timestamp, so this rejects
 * a retry that arrives more than 5 minutes late. See references/verification.md
 * for a manual verifier without that window.
 *
 * @param {string} rawBody - the exact body Outhire sent
 * @param {object} headers - webhook-id/-timestamp/-signature (see signatureHeaders)
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyOuthireWebhook(rawBody, headers, secret = process.env.OUTHIRE_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // throws WebhookVerificationError
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body has no event ID, so dedupe on the webhook-id header.
const processedDeliveryIds = new Set();

function handleEvent(event) {
  const { event: type, candidate = {}, job = {}, stage_change: stageChange = {} } = event;

  switch (type) {
    case 'candidate.applied':
      console.log(
        `Candidate ${candidate.id} (${candidate.name}) applied to job ${job.id} "${job.title}", fit score ${candidate.fit_score ?? 'pending'}`
      );
      break;
    case 'candidate.stage_changed':
      // changed_by is one of: user, joel, api
      console.log(
        `Candidate ${candidate.id} moved ${stageChange.previous_stage} -> ${stageChange.new_stage} (by ${stageChange.changed_by})`
      );
      break;
    case 'webhook.ping':
      // Sent by "Send test ping"; a signed delivery, not a challenge.
      console.log(`Test ping for webhook ${event.webhook?.id}`);
      break;
    default:
      console.log(`Unhandled Outhire event: ${type}`);
  }
}

// Outhire webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever the content type; express.json() would re-serialise
// the body and break verification. Parse only after the check.
app.post('/webhooks/outhire', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.OUTHIRE_WEBHOOK_SECRET) {
    console.error('OUTHIRE_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyOuthireWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Outhire webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Outhire does not resend a delivered event, but dedupe anyway.
  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Outhire needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Outhire event:', err);
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
    console.log(`Outhire webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/outhire`);
  });
}

module.exports = { app, server, verifyOuthireWebhook, signatureHeaders };
