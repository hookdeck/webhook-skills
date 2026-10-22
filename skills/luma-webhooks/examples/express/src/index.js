// Generated with: luma-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set LUMA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`LUMA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Luma webhook signature.
 *
 * Header: `Webhook-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the WHOLE secret string
 * (including the `whsec_` prefix) as UTF-8. This is not Standard Webhooks.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Webhook-Signature` header value
 * @param {string} secret - Webhook secret (whsec_...)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid and fresh
 */
function verifyLumaWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // Luma suggests rejecting old timestamps, but retries (and Hookdeck's) carry the
  // original `t`, so the window is opt-in (toleranceSeconds > 0).
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

// Luma webhook endpoint - must use the raw body for signature verification.
// type '*/*' so the body is raw whatever Content-Type the sender (or a proxy) uses.
app.post('/webhooks/luma', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['webhook-signature'];
  const secret = process.env.LUMA_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing Webhook-Signature header');
  }
  if (!secret) {
    console.error('LUMA_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyLumaWebhook(req.body, header, secret)) {
    console.error('Luma webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification. Body shape: { type, data }.
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { type, data } = event;
  switch (type) {
    case 'guest.registered':
      console.log(`Guest registered: ${data?.user_email} for ${data?.event?.name}`);
      break;
    case 'guest.updated':
      console.log(`Guest updated: ${data?.user_email} (${data?.approval_status})`);
      break;
    case 'guest.refunded':
      console.log(`Guest refunded: ${data?.user_email}`);
      break;
    case 'ticket.registered':
      console.log(`Ticket registered: ${data?.event_ticket?.id} for ${data?.user_email}`);
      break;
    case 'event.created':
      console.log(`Event created: ${data?.name} (${data?.id})`);
      break;
    case 'event.updated':
      console.log(`Event updated: ${data?.name} (${data?.id})`);
      break;
    case 'event.canceled':
      console.log(`Event canceled: ${data?.name} (${data?.id})`);
      break;
    case 'calendar.event.added':
      console.log(`Event added to calendar: ${data?.name ?? data?.id}`);
      break;
    case 'calendar.event.submitted':
      console.log(`Event submitted for approval: ${data?.name ?? data?.id}`);
      break;
    case 'calendar.person.subscribed':
      console.log(`Calendar person subscribed: ${data?.email}`);
      break;
    case 'calendar.person.unsubscribed':
      console.log(`Calendar person unsubscribed: ${data?.email}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Use the Webhook-Id header as an idempotency key; Luma may
  // deliver the same event more than once.

  // Respond 2xx within 5 seconds, otherwise Luma retries (a 410 pauses the webhook).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyLumaWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/luma`);
  });
}
