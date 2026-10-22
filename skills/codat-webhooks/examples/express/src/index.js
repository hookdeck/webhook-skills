// Generated with: codat-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Codat delivers webhooks through Svix using the Standard Webhooks header names:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// NOTE: these are webhook-*, not svix-*.
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each Codat webhook endpoint has its own signing secret.
// ---------------------------------------------------------------------------

/**
 * Verify a Codat delivery with the Standard Webhooks library. It checks the
 * timestamp (5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry (several during rotation).
 *
 * @param {string} rawBody - the exact body Codat sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyCodatWebhook(rawBody, headers, secret = process.env.CODAT_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header, which is the same on every retry.
const processedMessageIds = new Set();

function handleEvent(event) {
  const type = event.eventType || event.type;
  const payload = event.payload || {};

  switch (type) {
    case 'company.created':
      console.log(`Company created: ${payload.referenceCompany?.id ?? payload.companyId ?? 'unknown'}`);
      break;
    case 'connection.created':
    case 'connection.connected':
      console.log(`${type}: ${payload.connection?.id ?? payload.connectionId ?? 'unknown'}`);
      break;
    case 'read.completed':
      console.log(`Read completed${payload.dataType ? ` for ${payload.dataType}` : ''}`);
      break;
    case 'write.successful':
      console.log('Write successful');
      break;
    default:
      console.log(`Unhandled Codat event type: ${type}`);
  }
}

// Codat webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/codat', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CODAT_WEBHOOK_SECRET) {
    console.error('CODAT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyCodatWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Codat webhook verification failed:', err.message);
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
    console.error('Error handling Codat event:', err);
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
    console.log(`Codat webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/codat`);
  });
}

module.exports = { app, server, verifyCodatWebhook };
