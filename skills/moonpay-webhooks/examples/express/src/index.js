// Generated with: moonpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MOONPAY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MOONPAY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a MoonPay webhook signature (POST webhooks only).
 *
 * Header: `Moonpay-Signature-V2: t=<unix seconds>,s=<lowercase hex>`
 * s = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the webhook API key as a string.
 * GET callbacks sign the query string instead and are NOT covered here.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Moonpay-Signature-V2` header value
 * @param {string} apiKey - Webhook API key (e.g. wk_test_xxxxx)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid (and fresh, if a window is set)
 */
function verifyMoonpayWebhook(
  rawBody,
  header,
  apiKey,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !apiKey) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signature = parts.find(([k]) => k === 's')?.[1];
  if (!t || !/^\d+$/.test(t) || !signature) return false;

  // Opt-in replay window: retries and replays carry the original `t`.
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}

// MoonPay webhook endpoint - must use the raw body for signature verification.
// '*/*' reads the raw bytes whatever the content type, so every request can be verified.
app.post('/webhooks/moonpay', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['moonpay-signature-v2'];
  const apiKey = process.env.MOONPAY_WEBHOOK_API_KEY;

  if (!header) {
    return res.status(400).send('Missing Moonpay-Signature-V2 header');
  }
  if (!apiKey) {
    console.error('MOONPAY_WEBHOOK_API_KEY is not set');
    return res.status(500).send('Webhook API key not configured');
  }
  if (!Buffer.isBuffer(req.body) || !verifyMoonpayWebhook(req.body, header, apiKey)) {
    console.error('MoonPay webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification.
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { type, data } = event;
  switch (type) {
    case 'transaction_created':
      console.log(`Buy transaction created: ${data?.id} (${data?.status})`);
      break;
    case 'transaction_updated':
      console.log(`Buy transaction updated: ${data?.id} (${data?.status})`);
      break;
    case 'transaction_failed':
      console.log(`Buy transaction failed: ${data?.id} (${data?.failureReason})`);
      break;
    case 'sell_transaction_created':
      console.log(`Sell transaction created: ${data?.id} (${data?.status})`);
      break;
    case 'sell_transaction_updated':
      console.log(`Sell transaction updated: ${data?.id} (${data?.status})`);
      break;
    case 'sell_transaction_failed':
      console.log(`Sell transaction failed: ${data?.id} (${data?.failureReason})`);
      break;
    case 'sell_transaction_requote_required':
      console.log(`Sell transaction needs a requote: ${data?.id}`);
      break;
    case 'identity_check_updated':
      console.log(`Identity check updated: ${data?.id} (${data?.status})`);
      break;
    case 'customer.identity_status_updated': // Platform webhook
      console.log(`Customer ${data?.customerId} identity status: ${data?.status}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Delivery is at-least-once and unordered: dedupe on type + data.id +
  // data.updatedAt (Platform events also repeat the `webhook-id` header), and use updatedAt
  // rather than arrival order to decide which state is newer.

  // Respond 2xx within 5 seconds; anything else is a failed delivery and is retried.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMoonpayWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/moonpay`);
  });
}
