// Generated with: speed-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Speed (tryspeed.com) signs webhooks with Standard Webhooks:
//   webhook-id         the delivery ID (new on every retry)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its prefix. Speed shows the
// secret as `wsec_<base64>`; the library only strips `whsec_`, so swap the prefix.
// ---------------------------------------------------------------------------

/**
 * Speed shows the secret with a wsec_ prefix. The standardwebhooks library
 * only understands whsec_, so turn a leading wsec_ into whsec_.
 */
function toStandardSecret(secret) {
  return secret.startsWith('wsec_') ? `whsec_${secret.slice('wsec_'.length)}` : secret;
}

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
 * Verify a Speed delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Speed sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's wsec_ (or whsec_) signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifySpeedWebhook(rawBody, headers, secret = process.env.SPEED_WEBHOOK_SECRET) {
  return new Webhook(toStandardSecret(secret)).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Speed re-signs retries with a NEW webhook-id, so dedupe on the event `id` (evt_...).
const processedEventIds = new Set();

function handleEvent(event) {
  const { event_type: type, data = {} } = event;
  const obj = data.object || {};

  switch (type) {
    // --- Payments ----------------------------------------------------------
    case 'payment.created':
    case 'payment.paid':
    case 'payment.confirmed':
    case 'payment.expired':
    case 'payment.cancelled':
      console.log(`${type}: ${obj.id} (${obj.amount} ${obj.currency}, status=${obj.status})`);
      break;

    // --- Checkout sessions and links ---------------------------------------
    case 'checkout_session.created':
    case 'checkout_session.paid':
    case 'checkout_session.payment_paid':
    case 'checkout_session.deactivated':
    case 'checkout_link.created':
    case 'checkout_link.paid':
    case 'checkout_link.deactivated':
      console.log(`${type}: ${obj.id} (status=${obj.status})`);
      break;

    // --- Payment links, addresses, payrequests, invoices -------------------
    case 'payment_link.created':
    case 'payment_link.paymentreceived':
    case 'payment_link.deactivated':
    case 'payment_address.paymentreceived':
    case 'payrequest.payment_paid':
    case 'invoice.paid':
      console.log(`${type}: ${obj.id}`);
      break;

    // --- Withdrawals -------------------------------------------------------
    case 'withdraw.created':
    case 'withdraw.paid':
    case 'withdraw.failed':
    case 'withdrawal_link.created':
    case 'withdrawal_link.paid':
    case 'withdrawal_link.deactivated':
    case 'withdraw_request.created':
    case 'withdraw_request.paid':
    case 'withdraw_request.deactivated':
      console.log(`${type}: ${obj.id} (status=${obj.status})`);
      break;

    // --- Connect (events for connected accounts carry data.account_id) -----
    case 'connect.completed':
      console.log(`${type}: ${obj.id ?? data.account_id}`);
      break;

    default:
      // Speed's event list may grow: acknowledge, don't fail.
      console.log(`Unhandled Speed event type: ${type}`);
  }
}

// speed webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/speed', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SPEED_WEBHOOK_SECRET) {
    console.error('SPEED_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = readSignatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing Standard Webhooks signature headers' });
  }

  let event;
  try {
    event = verifySpeedWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Speed webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries get a new webhook-id but keep the event id; acknowledge duplicates with 200.
  const eventId = event.id || headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Reply 2xx quickly: any other status is retried. In production, enqueue the
    // event here and process it asynchronously. Compare event.modified before
    // overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Speed event:', err);
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
    console.log(`speed webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/speed`);
  });
}

module.exports = { app, server, verifySpeedWebhook, readSignatureHeaders, toStandardSecret };
