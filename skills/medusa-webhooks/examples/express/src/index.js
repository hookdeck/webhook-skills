// Generated with: medusa-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): Medusa re-signs its own retries, but
// Hookdeck retries and replays resend the original timestamp, so a window would reject late
// redeliveries. Set MEDUSA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any
// other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MEDUSA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Medusa Cloud webhook signature.
 *
 * Header: `X-Medusa-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the endpoint signing secret as UTF-8.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `X-Medusa-Signature` header value
 * @param {string} secret - Endpoint signing secret
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid and fresh
 */
function verifyMedusaWebhook(
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

  // Medusa's docs suggest a 5-minute window, but Hookdeck retries and replays carry the
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

// Medusa webhook endpoint - must use the raw body for signature verification.
// type: '*/*' reads the body as a Buffer whatever the content type is.
app.post('/webhooks/medusa', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-medusa-signature'];
  const secret = process.env.MEDUSA_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing X-Medusa-Signature header');
  }
  if (!secret) {
    console.error('MEDUSA_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyMedusaWebhook(req.body, header, secret)) {
    console.error('Medusa webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification. The body is one event object: { id, type, data, created_at }.
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).send('Expected an event object');
  }

  const { id, type, data } = event;
  const where = `${data?.project?.handle}/${data?.environment?.handle}`;
  switch (type) {
    case 'build.created':
      console.log(`Build created for ${where}: ${data?.build?.id}`);
      break;
    case 'build.succeeded':
      console.log(`Build succeeded for ${where}: ${data?.build?.id} (${data?.build?.commit_hash})`);
      break;
    case 'build.failed':
      console.log(`Build failed for ${where}: ${data?.build?.id}`);
      break;
    case 'build.canceled':
      console.log(`Build canceled for ${where}: ${data?.build?.id}`);
      break;
    case 'deployment.created':
      console.log(`Deployment created for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.succeeded':
      console.log(`Deployment succeeded for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.failed':
      console.log(`Deployment failed for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.canceled':
      console.log(`Deployment canceled for ${where}: ${data?.deployment?.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. `id` (also the X-Medusa-Delivery header) is reused across
  // retries of the same event: use it as the idempotency key.
  console.log(`Processed delivery ${id}`);

  // Respond 2xx within ten seconds, otherwise Medusa retries (it doesn't follow redirects).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMedusaWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/medusa`);
  });
}
