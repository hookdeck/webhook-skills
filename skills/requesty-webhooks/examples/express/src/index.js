// Generated with: requesty-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Requesty delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique message ID (alert `id`, or sample `request_id`);
//                      the same on every retry
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the organisation's secret after its `whsec_` prefix.
// There is one signing secret per organisation (Admin Panel > Alerts); during
// a rotation grace period webhook-signature carries several v1 entries.
// Until the organisation has a secret, deliveries are unsigned and fail here.
// Hookdeck's Requesty source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
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
 * Verify a Requesty delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body Requesty sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the organisation's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyRequestyWebhook(rawBody, headers, secret = process.env.REQUESTY_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is the same on every retry (only the timestamp and signature change).
const processedMessageIds = new Set();

/**
 * The event name. X-Requesty-Event is the only carrier both alerts and sample
 * requests share; alert bodies also carry a top-level `type` with the same value.
 */
function eventTypeOf(headerValue, body) {
  return headerValue || body.type || 'unknown';
}

function handleEvent(type, body) {
  switch (type) {
    // --- Spending alerts: {id, type, data} ---------------------------------
    case 'user.budget.exceeded_percent': {
      const d = body.data || {};
      console.log(`User ${d.user_email} (${d.user_id}) reached ${Number(d.percentage_exceeded) * 100}% of their $${d.limit} budget (spend $${d.spend})`);
      break;
    }
    case 'user.budget.exceeded_absolute': {
      const d = body.data || {};
      console.log(`User ${d.user_email} (${d.user_id}) passed the $${d.absolute_exceeded} spend threshold (spend $${d.spend})`);
      break;
    }
    case 'group.budget.exceeded_percent': {
      const d = body.data || {};
      console.log(`Group ${d.group_name} (${d.group_id}) reached ${Number(d.percentage_exceeded) * 100}% of its $${d.limit} budget (spend $${d.spend})`);
      break;
    }
    case 'org.balance.below_absolute': {
      const d = body.data || {};
      console.log(`Organisation ${d.org_id} balance $${d.current_balance} is below $${d.balance_threshold}`);
      break;
    }
    case 'apikey.budget.exceeded_percent': {
      const d = body.data || {};
      console.log(`API key ${d.api_key_name} (${d.api_key_id}) reached ${Number(d.percentage_exceeded) * 100}% of its $${d.limit} budget (spend $${d.spend})`);
      break;
    }
    case 'apikey.budget.exceeded_absolute': {
      const d = body.data || {};
      console.log(`API key ${d.api_key_name} (${d.api_key_id}) passed the $${d.absolute_exceeded} spend threshold (spend $${d.spend})`);
      break;
    }

    // --- Sample requests: {request_id, request, response} (no `type`) ------
    case 'sample.request':
      console.log(`Sampled request ${body.request_id} (model ${body.request?.model}, tokens ${body.response?.usage?.total_tokens})`);
      break;

    default:
      // The documented list may not be exhaustive.
      console.log(`Unhandled Requesty event type: ${type}`);
  }
}

// Requesty webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break
// verification.
app.post('/webhooks/requesty', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.REQUESTY_WEBHOOK_SECRET) {
    console.error('REQUESTY_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyRequestyWebhook(req.body, headers);
  } catch (err) {
    console.error('Requesty webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is retried (up to 3 times), so acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Requesty times out after 15 seconds per attempt. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(eventTypeOf(req.get('x-requesty-event'), event), event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Requesty event:', err);
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
    console.log(`Requesty webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/requesty`);
  });
}

module.exports = { app, server, verifyRequestyWebhook, resolveSignatureHeaders, eventTypeOf };
