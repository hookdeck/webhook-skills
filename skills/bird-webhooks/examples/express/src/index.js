// Generated with: bird-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Bird (bird.com, formerly MessageBird) follows the Standard Webhooks spec:
//   webhook-id         identifies the delivery (stable across retries/replays)
//   webhook-timestamp  Unix seconds of this delivery attempt
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list during
//                      the 24h secret-rotation overlap)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Not covered: the legacy MessageBird API (MessageBird-Signature /
// MessageBird-Signature-JWT headers) uses a different scheme.
// ---------------------------------------------------------------------------

/**
 * Verify a Bird delivery with the Standard Webhooks library. It rejects
 * timestamps more than 5 minutes off, recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Bird sent
 * @param {object} headers - request headers (lowercase names, as Node gives them)
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyBirdWebhook(rawBody, headers, secret = process.env.BIRD_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bird delivers at-least-once; every retry and replay reuses the webhook-id.
const processedDeliveryIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    case 'email.delivered':
      console.log(`Email delivered: ${data.email_id} to ${data.recipient}`);
      break;
    case 'email.bounced':
      console.log(
        `Email bounced: ${data.email_id} to ${data.recipient} (${data.bounce_type}, code ${data.bounce_code})`
      );
      break;
    case 'email.complained':
      console.log(`Email complaint: ${data.email_id} from ${data.recipient}`);
      break;
    case 'whatsapp.received':
      console.log(`WhatsApp message received: ${data.whatsapp_id} from ${data.from?.phone_number}`);
      break;
    case 'preference.granted':
    case 'preference.revoked':
      console.log(`${type}: ${data.channel} ${data.handle} (${data.coverage})`);
      break;

    default:
      // Bird adds event types as products ship. Ignore ones you don't handle.
      console.log(`Unhandled Bird event type: ${type}`);
  }
}

// Bird webhook endpoint. express.raw() with type '*/*' keeps the exact bytes
// for the HMAC whatever Content-Type arrives; express.json() would
// re-serialise the body and break verification.
app.post('/webhooks/bird', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BIRD_WEBHOOK_SECRET) {
    console.error('BIRD_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const deliveryId = req.get('webhook-id');
  if (!deliveryId || !req.get('webhook-timestamp') || !req.get('webhook-signature')) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyBirdWebhook(req.body.toString('utf8'), req.headers);
  } catch (err) {
    // 400 is deliberate: Bird retries, so a missing/rotating secret can be
    // fixed before the retry window closes.
    console.error('Bird webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Bird waits 15 seconds for a 2xx. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Bird event:', err);
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
    console.log(`Bird webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bird`);
  });
}

module.exports = { app, server, verifyBirdWebhook };
