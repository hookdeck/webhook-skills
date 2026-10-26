// Generated with: lettermint-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set LETTERMINT_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.LETTERMINT_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`LETTERMINT_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Lettermint webhook signature.
 *
 * Header: `X-Lettermint-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the whole webhook secret
 * (including `whsec_`) as UTF-8 bytes. Not Standard Webhooks: nothing is stripped or decoded.
 *
 * @param {Buffer} rawBody - Raw request body bytes (do NOT re-stringify parsed JSON)
 * @param {string} header - `X-Lettermint-Signature` header value
 * @param {string} secret - Webhook secret (whsec_...)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid (and fresh, if a window is set)
 */
function verifyLettermintWebhook(
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
  if (!t) return false;

  // Lettermint recommends a 5-minute window, but retries (and Hookdeck's replays) carry the
  // original `t`, so the window is opt-in (toleranceSeconds > 0).
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  // Sign `t` exactly as sent (never parse and re-format it), then the raw body bytes.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(`${t}.`, 'latin1'))
    .update(rawBody)
    .digest();

  // Any v1 may match (several appear during key rotation). Validate length and alphabet before
  // decoding: Buffer.from(x, 'hex') silently drops bad characters.
  return signatures.some(
    (sig) => /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );
}

// Lettermint webhook endpoint - must use the raw body for signature verification.
// type '*/*' reads the exact bytes whatever the content type.
app.post('/webhooks/lettermint', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-lettermint-signature'];
  const secret = process.env.LETTERMINT_WEBHOOK_SECRET;

  if (!secret) {
    console.error('LETTERMINT_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!header) {
    return res.status(401).send('Missing X-Lettermint-Signature header');
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyLettermintWebhook(rawBody, header, secret)) {
    console.error('Lettermint webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  const { id, event, data } = payload;
  switch (event) {
    case 'message.delivered':
      console.log(`Message delivered to ${data?.recipient}: ${data?.message_id}`);
      break;
    case 'message.hard_bounced':
      console.log(`Hard bounce for ${data?.recipient}: remove from lists`);
      break;
    case 'message.soft_bounced':
      console.log(`Soft bounce for ${data?.recipient}: ${data?.message_id}`);
      break;
    case 'message.spam_complaint':
      console.log(`Spam complaint from ${data?.recipient}: stop mailing`);
      break;
    case 'message.failed':
      console.log(`Message failed (${data?.reason_code}): ${data?.message_id}`);
      break;
    case 'suppression.added':
      console.log(`Suppression added: ${data?.value} (${data?.reason})`);
      break;
    case 'webhook.test':
      console.log('Received Lettermint test event');
      break;
    default:
      console.log(`Unhandled event type: ${event}`);
  }
  // TODO: persist / forward. `id` is unique per event: use it as the idempotency key.
  console.log(`Processed ${event} (id ${id})`);

  // Respond 2XX quickly; timeouts, 408, 429 and 5xx are retried (12 attempts over ~14 hours).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyLettermintWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lettermint`);
  });
}
