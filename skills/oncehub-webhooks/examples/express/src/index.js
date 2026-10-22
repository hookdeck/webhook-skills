// Generated with: oncehub-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a OnceHub (v2) webhook signature.
 *
 * Header: `Oncehub-Signature: t=<unix seconds>,s=<hex>`
 * s = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the endpoint secret as a UTF-8 string.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Oncehub-Signature` header value
 * @param {string} secret - Endpoint secret (Webhook & API integration > View secret)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid and fresh
 */
function verifyOncehubWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 's').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // A 5-minute window would reject late retries: OnceHub's and Hookdeck's retries and replays
  // resend the original `t`, so the window is opt-in (toleranceSeconds > 0).
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}

// OnceHub webhook endpoint - must use the raw body for signature verification.
app.post('/webhooks/oncehub', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['oncehub-signature'];
  const secret = process.env.ONCEHUB_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing Oncehub-Signature header');
  }
  if (!secret) {
    console.error('ONCEHUB_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyOncehubWebhook(req.body, header, secret)) {
    console.error('OnceHub webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification. The body is one event: { id, object: 'event', type, data, ... }
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { type, data } = event;
  switch (type) {
    case 'booking.scheduled':
      console.log(`Booking scheduled: ${data?.id} (${data?.subject}) at ${data?.starting_time}`);
      break;
    case 'booking.rescheduled':
      console.log(`Booking rescheduled: ${data?.id} (was ${data?.rescheduled_booking_id})`);
      break;
    case 'booking.reassigned':
      console.log(`Booking reassigned: ${data?.id} to ${data?.owner?.email}`);
      break;
    case 'booking.canceled_then_rescheduled':
      console.log(`Booking canceled then rescheduled: ${data?.id}`);
      break;
    case 'booking.canceled_reschedule_requested':
      console.log(`Booking canceled, reschedule requested: ${data?.id}`);
      break;
    case 'booking.canceled':
      console.log(`Booking canceled: ${data?.id} (${data?.cancel_reschedule_information?.reason || 'no reason'})`);
      break;
    case 'booking.completed':
      console.log(`Booking completed: ${data?.id}`);
      break;
    case 'booking.no_show':
      console.log(`Booking no-show: ${data?.id}`);
      break;
    case 'conversation.started':
    case 'conversation.closed':
    case 'conversation.abandoned':
      console.log(`${type}: ${data?.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Use the event `id` (EVNT-...) as the idempotency key.

  // Return 2XX once accepted; otherwise OnceHub retries (exponential backoff, ~3 days) and then disables the webhook.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyOncehubWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/oncehub`);
  });
}
