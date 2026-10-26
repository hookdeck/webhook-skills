// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Axilio signs deliveries with Standard Webhooks:
//   webhook-id         unique message identifier (equals the body's `id`)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// Axilio shows the secret once, when you register the destination.
// ---------------------------------------------------------------------------

/**
 * Verify an Axilio delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Retries and replays resend the ORIGINAL timestamp, so this rejects a retry
 * that lands more than 5 minutes after the first attempt. See
 * references/verification.md for a manual verifier with a configurable window.
 *
 * @param {Buffer|string} rawBody - the exact bytes Axilio sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @returns {object} the parsed, verified event
 * @throws {Error} if the delivery does not verify
 */
function verifyAxilioWebhook(rawBody, headers, secret = process.env.AXILIO_WEBHOOK_SECRET) {
  if (!secret) throw new Error('AXILIO_WEBHOOK_SECRET is not set');
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body `id` (= webhook-id) is the same every time one change is delivered.
const processedEventIds = new Set();

function handleEvent(event) {
  // Envelope: { id, type, occurred_at, test, data }. `data` uses the API's
  // field names and carries ids, statuses, reasons and timestamps only.
  const { type, data } = event;

  if (event.test) {
    // Sent from the dashboard's Test button: acknowledge, don't act on it.
    console.log(`Test delivery received: ${type}`);
    return;
  }

  switch (type) {
    // --- Runs (data.id = run id) --------------------------------------------
    case 'run.started':
      console.log(`Run ${data.id} started`);
      break;
    case 'run.completed':
      // Fetch the run through the API for outputs; the payload has none.
      console.log(`Run ${data.id} completed`);
      break;
    case 'run.failed':
      console.log(`Run ${data.id} failed`);
      break;
    case 'run.cancelled':
      // data.reason is "user" or "queue_timeout".
      console.log(`Run ${data.id} cancelled (${data.reason})`);
      break;

    // --- Sessions -----------------------------------------------------------
    case 'session.started':
      console.log(`Session ${data.session_id} started`);
      break;
    case 'session.ended':
      // data.end_reason: released, idle_timeout, max_duration, run_finished, device_lost.
      console.log(`Session ${data.session_id} ended (${data.end_reason})`);
      break;
    case 'session.recording_ready':
      console.log(`Recording ready for session ${data.session_id}`);
      break;

    // --- Billing ------------------------------------------------------------
    case 'balance.low':
    case 'balance.depleted':
    case 'balance.recovered':
      console.log(`${type}: balance ${data.balance_display}`);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;
    case 'subscription.updated':
    case 'subscription.canceled':
      console.log(`${type}: subscription ${data.subscription_id} is ${data.status}`);
      break;
    case 'auto_recharge.succeeded':
    case 'auto_recharge.failed':
      // After a failure Axilio turns auto-recharge off until you re-enable it.
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;

    // --- Files --------------------------------------------------------------
    case 'file.ready':
    case 'file.capture_failed':
    case 'file.delivered':
    case 'file.delivery_failed':
      console.log(`${type}: file ${data.file_id || data.id}`);
      break;

    // --- Phones (rented phones only) ----------------------------------------
    case 'phone.maintenance_started':
    case 'phone.maintenance_ended':
    case 'phone.offline':
    case 'phone.online':
      console.log(`${type}: phone ${data.phone_id}`);
      break;
    case 'phone.rental.activated':
    case 'phone.rental.past_due':
    case 'phone.rental.canceled':
      console.log(`${type}: rental ${data.id}`);
      break;

    case 'webhook.test':
      console.log('webhook.test received');
      break;

    default:
      // Axilio may add event types over time.
      console.log(`Unhandled Axilio event type: ${type}`);
  }
}

// Axilio webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for any content type; express.json() would re-serialise the body and break
// the signature.
app.post('/webhooks/axilio', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AXILIO_WEBHOOK_SECRET) {
    console.error('AXILIO_WEBHOOK_SECRET is not set, rejecting delivery');
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

  // express.raw leaves req.body as {} when the request has no body.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  let event;
  try {
    event = verifyAxilioWebhook(rawBody, headers);
  } catch (err) {
    console.error('Axilio webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Redelivery is normal (at-least-once delivery, replays from the dashboard).
  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Respond 2xx quickly. In production, store or enqueue the event here and
    // do slow work afterwards.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Axilio event:', err);
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
    console.log(`Axilio webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/axilio`);
  });
}

module.exports = { app, server, verifyAxilioWebhook };
