// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Axilio signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique per event (same value as the body's `id`)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the destination's secret after its `whsec_` prefix.
// Each Axilio destination has its own signing secret.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers. Axilio sends webhook-*; if webhook-id is
 * absent the svix-* equivalents are used instead (Hookdeck does the same).
 * The values come back under the names the standardwebhooks library expects.
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
 * Verify an Axilio delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body, compares in constant time against every `v1,`
 * entry, and rejects timestamps more than 5 minutes from now. Note that
 * Hookdeck retries and replays resend the ORIGINAL timestamp, so late retries
 * fail this window; references/verification.md has a manual verifier where the
 * window can be dropped or widened.
 *
 * @param {string} rawBody - the exact body Axilio sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the destination's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyAxilioWebhook(rawBody, headers, secret = process.env.AXILIO_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // throws WebhookVerificationError
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body `id` equals the webhook-id header and is stable across retries.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Runs --------------------------------------------------------------
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
      console.log(`${type}: run ${data.id} (workflow ${data.workflow_id}, status ${data.status})`);
      break;
    case 'run.cancelled':
      // reason is `user` or `queue_timeout`
      console.log(`run.cancelled: run ${data.id} (${data.reason})`);
      break;

    // --- Sessions ----------------------------------------------------------
    case 'session.started':
      console.log(`session.started: ${data.session_id} on phone ${data.phone_id}`);
      break;
    case 'session.ended':
      // end_reason: released, idle_timeout, max_duration, run_finished, device_lost
      console.log(`session.ended: ${data.session_id} (${data.end_reason})`);
      break;
    case 'session.recording_ready':
      console.log(`session.recording_ready: ${data.session_id}`);
      break;

    // --- Billing -----------------------------------------------------------
    case 'balance.low':
    case 'balance.depleted':
    case 'balance.recovered':
      console.log(`${type}: balance ${data.balance_display} (alert ${data.alert_id})`);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      console.log(`${type}: ${data.invoice_number} (${data.amount_microdollars} microdollars)`);
      break;
    case 'subscription.updated':
    case 'subscription.canceled':
      console.log(`${type}: ${data.plan_name} is ${data.status}`);
      break;
    case 'auto_recharge.succeeded':
    case 'auto_recharge.failed':
      console.log(`${type}: invoice ${data.stripe_invoice_id}`);
      break;

    // --- Files -------------------------------------------------------------
    case 'file.ready':
    case 'file.capture_failed':
    case 'file.delivered':
    case 'file.delivery_failed':
      console.log(`${type}: ${data.filename} (${data.id})`);
      break;

    // --- Phones (rented phones only) ---------------------------------------
    case 'phone.maintenance_started':
    case 'phone.maintenance_ended':
    case 'phone.offline':
    case 'phone.online':
      console.log(`${type}: phone ${data.phone_id} (${data.reason ?? data.status})`);
      break;
    case 'phone.rental.activated':
    case 'phone.rental.past_due':
    case 'phone.rental.canceled':
      console.log(`${type}: rental ${data.id} for phone ${data.phone_id}`);
      break;

    // --- Platform ----------------------------------------------------------
    case 'webhook.test':
      console.log('webhook.test received');
      break;

    default:
      console.log(`Unhandled Axilio event type: ${type}`);
  }
}

// Axilio webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever the content type; express.json() would re-serialise
// the body and break verification.
app.post('/webhooks/axilio', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AXILIO_WEBHOOK_SECRET) {
    console.error('AXILIO_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = signatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyAxilioWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Axilio webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // At-least-once delivery: retries reuse the same id; acknowledge duplicates.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    // Order is not guaranteed: compare event.occurred_at when it matters.
    handleEvent(event);
    processedEventIds.add(eventId);
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

module.exports = { app, server, verifyAxilioWebhook, signatureHeaders };
