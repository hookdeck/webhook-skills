// Generated with: camel-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// camelAI (camelRun) webhooks follow Standard Webhooks:
//   webhook-id         the event id (evt_...), stable across retries
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Hookdeck also accepts the svix-* spelling of the same three headers, so
// this handler does too.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers, preferring webhook-* and falling back to
 * svix-* when webhook-id is absent (the same rule Hookdeck applies).
 *
 * @param {(name: string) => string | undefined} get - header lookup
 * @returns {{id?: string, timestamp?: string, signature?: string}}
 */
function extractSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: get(`${prefix}-id`),
    timestamp: get(`${prefix}-timestamp`),
    signature: get(`${prefix}-signature`),
  };
}

/**
 * Verify a camelAI delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. The library expects
 * webhook-* names, so the values are passed under those names whichever prefix
 * the request used.
 *
 * Hookdeck retries and replays resend the original timestamp, so a retry later
 * than 5 minutes is rejected here. See references/verification.md for a manual
 * verifier without the window.
 *
 * @param {string} rawBody - the exact body camelAI sent
 * @param {{id?: string, timestamp?: string, signature?: string}} sig
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyCamelAiWebhook(rawBody, sig, secret = process.env.CAMEL_AI_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': sig.id,
    'webhook-timestamp': sig.timestamp,
    'webhook-signature': sig.signature,
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at least once and the event id is stable across retries.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event; // data fields vary by event type

  switch (type) {
    // --- Runs ----------------------------------------------------------------
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
      console.log(`${type}: event ${event.id}`);
      break;

    // --- Human input ---------------------------------------------------------
    case 'input.requested':
    case 'input.resolved':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- Usage ---------------------------------------------------------------
    case 'usage.recorded':
      console.log(`Usage recorded: ${JSON.stringify(data)}`);
      break;

    // --- Voice sessions ------------------------------------------------------
    case 'voice.session.started':
    case 'voice.session.ended':
    case 'voice.session.error':
    case 'voice.utterance':
    case 'voice.speech.started':
    case 'voice.speech.ended':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- Billing -------------------------------------------------------------
    case 'billing.balance.low':
    case 'billing.balance.depleted':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    // --- End-user credits ----------------------------------------------------
    case 'end_user.balance.low':
    case 'end_user.credit.exhausted':
    case 'end_user.credit.granted':
    case 'end_user.credit.refunded':
    case 'end_user.credit.adjusted':
    case 'end_user.allowance.low':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    default:
      console.log(`Unhandled camelAI event type: ${type}`);
  }
}

// camelAI webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever Content-Type arrives; express.json() would re-serialise
// the body and break verification. Parse only after the check.
app.post('/webhooks/camel-ai', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CAMEL_AI_WEBHOOK_SECRET) {
    console.error('CAMEL_AI_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const sig = extractSignatureHeaders((name) => req.get(name));
  if (!sig.id || !sig.timestamp || !sig.signature) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  let event;
  try {
    event = verifyCamelAiWebhook(rawBody, sig);
  } catch (err) {
    console.error('camelAI webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // A correctly signed but empty or non-JSON body is not an event envelope.
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Retries reuse the same event id; acknowledge duplicates with 200.
  const eventId = event.id || sig.id;
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // camelAI needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously. Retries can reorder, so order by
    // event.created (Unix seconds), not arrival.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling camelAI event:', err);
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
    console.log(`camelAI webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/camel-ai`);
  });
}

module.exports = { app, server, verifyCamelAiWebhook, extractSignatureHeaders };
