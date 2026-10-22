// Generated with: go1-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set GO1_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`GO1_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Go1 webhook signature.
 *
 * Header: `Go1-Signature: t=<unix MILLISECONDS>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the webhook secret_key as a UTF-8 string.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Go1-Signature` header value
 * @param {string} secret - The secret_key set on the webhook
 * @param {number} toleranceSeconds - Max age of `t` in seconds; 0 turns the check off (default from env)
 * @param {number} nowMs - Current time in milliseconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid and fresh
 */
function verifyGo1Webhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowMs = Date.now()
) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // `t` is in milliseconds. The window is opt-in (toleranceSeconds > 0) because
  // retries and replays carry the original `t`.
  if (toleranceSeconds > 0 && Math.abs(nowMs - Number(t)) > toleranceSeconds * 1000) return false;

  // Use `t` exactly as received in the signed string.
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

// Go1 webhook endpoint - must use the raw body for signature verification.
// type: '*/*' makes the raw parser accept any content type.
app.post('/webhooks/go1', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['go1-signature'];
  const secret = process.env.GO1_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing Go1-Signature header');
  }
  if (!secret) {
    console.error('GO1_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyGo1Webhook(req.body, header, secret)) {
    console.error('Go1 webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification.
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (event.event_type) {
    case 'enrollment.create':
      console.log(`Enrollment created: ${event.id}`);
      break;
    case 'enrollment.update':
      console.log(`Enrollment updated: ${event.id}`);
      break;
    case 'enrollment.delete':
      console.log(`Enrollment deleted: ${event.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }
  // TODO: persist / forward. Make handling idempotent (e.g. key on event_type + id).

  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyGo1Webhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/go1`);
  });
}
