// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Bayou Energy signs webhooks per the Standard Webhooks spec:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the company's secret after its `whsec_` prefix.
// Body: { event, object }
// ---------------------------------------------------------------------------

/**
 * Verify a Bayou Energy delivery with the Standard Webhooks library. It checks
 * the timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw
 * body, and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Bayou sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the company's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyBayouWebhook(rawBody, headers, secret = process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bayou payloads carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set();

function handleEvent(payload) {
  const { event, object = {} } = payload;

  switch (event) {
    // --- Bills -------------------------------------------------------------
    case 'new_bill':
      console.log(`New bill ${object.id} for customer ${object.customer_id} (${object.utility})`);
      break;
    case 'updated_bill':
      console.log(`Updated bill ${object.id} for customer ${object.customer_id}`);
      break;
    case 'new_unparsed_bill':
      // Bill found but not parsed yet; object.file_url is a short-lived link.
      console.log(`New unparsed bill ${object.id} for customer ${object.customer_id}`);
      break;

    // --- Customer data readiness -------------------------------------------
    case 'bills_ready':
      console.log(`Bills ready for customer ${object.id}: ${(object.bills_parsed || []).length} parsed`);
      break;
    case 'intervals_ready':
      console.log(
        `Intervals ready for customer ${object.id}: ${object.first_interval_discovered} to ${object.last_interval_discovered}`
      );
      break;

    // --- Customer credentials ----------------------------------------------
    case 'customer_has_filled_credentials':
      console.log(`Customer ${object.id} shared credentials for ${object.utility}`);
      break;
    case 'customer_must_reauthenticate':
      // reason: credentials_are_invalid or mfa_factor_has_expired
      console.log(`Customer ${object.id} must re-authenticate (${object.reason})`);
      break;

    default:
      console.log(`Unhandled Bayou Energy event: ${event}`);
  }
}

// Bayou Energy webhook endpoint. express.raw() keeps the exact bytes for the
// HMAC (any content type); express.json() would re-serialise the body and
// break verification.
app.post('/webhooks/bayou-energy', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
    console.error('BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery');
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

  let payload;
  try {
    payload = verifyBayouWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Bayou Energy webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Acknowledge duplicates (same webhook-id) with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Bayou Energy event:', err);
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
    console.log(`Bayou Energy webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bayou-energy`);
  });
}

module.exports = { app, server, verifyBayouWebhook };
