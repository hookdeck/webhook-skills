// Generated with: bayou-energy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Bayou Energy signs webhooks per the Standard Webhooks spec:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the message was sent
//   webhook-signature  one or more space-separated "v1,<base64>" entries
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256.
// Key: base64-decode of the company secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers. Bayou sends webhook-*; like Hookdeck, fall
 * back to the svix-* names when webhook-id is absent. The result always uses
 * the webhook-* names, which is what the standardwebhooks library expects.
 *
 * @param {(name: string) => string | undefined} get - header lookup
 */
function signatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
}

/**
 * Verify a Bayou delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body and
 * compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the ORIGINAL timestamp, so this rejects
 * a retry that arrives more than 5 minutes after the first attempt. See
 * references/verification.md for a manual verifier with a configurable window.
 *
 * @param {string} rawBody - the exact body Bayou sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the company's whsec_ signing secret
 * @returns {object} the parsed, verified event ({ event, object })
 * @throws {Error} if verification fails
 */
function verifyBayouWebhook(rawBody, headers, secret = process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bayou payloads carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set();

// Avoid logging object.file_url (pre-signed bill URL) or object.onboarding_token.
function handleEvent(payload) {
  const { event, object = {} } = payload;

  switch (event) {
    case 'new_bill':
    case 'updated_bill':
      console.log(
        `${event}: bill ${object.id} for customer ${object.customer_id} (${object.utility}), ` +
          `total ${object.total_amount}, status ${object.status}`
      );
      break;
    case 'bills_ready':
      // object is the customer; bills_parsed holds the initial bills.
      console.log(`Bills ready for customer ${object.id}: ${(object.bills_parsed || []).length} bills`);
      break;
    case 'intervals_ready':
      console.log(
        `Intervals ready for customer ${object.id}: ` +
          `${object.first_interval_discovered} to ${object.last_interval_discovered}`
      );
      break;
    case 'customer_has_filled_credentials':
      console.log(`Customer ${object.id} shared ${object.utility} credentials`);
      break;
    case 'new_unparsed_bill':
      // The bill exists but isn't parsed yet; wait for updated_bill.
      console.log(`Unparsed bill ${object.id} for customer ${object.customer_id} (${object.utility})`);
      break;
    case 'customer_must_reauthenticate':
      // reason: credentials_are_invalid or mfa_factor_has_expired
      console.log(`Customer ${object.id} must re-authenticate: ${object.reason}`);
      break;
    default:
      console.log(`Unhandled Bayou event: ${event}`);
  }
}

// Bayou webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever the content type; express.json() would re-serialise.
app.post('/webhooks/bayou-energy', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BAYOU_ENERGY_WEBHOOK_SECRET) {
    console.error('BAYOU_ENERGY_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let payload;
  try {
    payload = verifyBayouWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Bayou webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Bayou event:', err);
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

module.exports = { app, server, verifyBayouWebhook, signatureHeaders };
