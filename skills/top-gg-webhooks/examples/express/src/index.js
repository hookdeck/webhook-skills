// Generated with: top-gg-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set TOP_GG_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.TOP_GG_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`TOP_GG_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verify a Top.gg v1 webhook signature.
 *
 * Header: `x-topgg-signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`. Other keys (e.g. v0) are ignored.
 * v1 = hex HMAC-SHA256 over `<t>.<raw body bytes>`, keyed with the `whs_` secret used WHOLE as
 * UTF-8 bytes (not hex- or base64-decoded). `t` is used exactly as it appears in the header.
 *
 * @param {Buffer} rawBody - Raw request body bytes (do NOT re-stringify parsed JSON)
 * @param {string} header - `x-topgg-signature` header value
 * @param {string} secret - Webhook secret (whs_xxxxx)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether any v1 signature is valid (and fresh, when a window is set)
 */
function verifyTopGgWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((part) => {
    const p = part.trim();
    const i = p.indexOf('=');
    return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
  const t = pairs.find(([k]) => k === 't')?.[1];
  if (!t) return false;
  // Validate the format (exactly 64 hex chars) before comparing; hex is case-insensitive.
  const signatures = pairs
    .filter(([k, v]) => k === 'v1' && HEX_SHA256.test(v))
    .map(([, v]) => Buffer.from(v.toLowerCase()));
  if (signatures.length === 0) return false;

  // Top.gg sends Unix seconds. Hookdeck retries and replays keep the original `t`,
  // so the window is opt-in (toleranceSeconds > 0).
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  // Every candidate is 64 bytes, same as `expected`, so timingSafeEqual cannot throw.
  return signatures.some((sig) => crypto.timingSafeEqual(sig, expected));
}

// Wrong-typed fields in the (verified but still untrusted) body are treated as absent.
const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const asString = (x) => (typeof x === 'string' ? x : undefined);

// Top.gg webhook endpoint - express.raw({ type: '*/*' }) keeps the raw bytes for any content type.
app.post('/webhooks/top-gg', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-topgg-signature'];
  const secret = process.env.TOP_GG_WEBHOOK_SECRET;

  if (!secret) {
    console.error('TOP_GG_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (typeof header !== 'string' || !verifyTopGgWebhook(rawBody, header, secret)) {
    console.error('Top.gg webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification, and treat every field as untrusted.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(event)) {
    return res.status(400).send('Expected a JSON object');
  }

  const data = isObject(event.data) ? event.data : {};
  const user = isObject(data.user) ? data.user : {};
  const project = isObject(data.project) ? data.project : {};

  switch (event.type) {
    case 'vote.create':
      // data.id is the vote ID: deduplicate on it. data.weight is 2 during weekend multipliers.
      console.log(
        `Vote ${asString(data.id)} on ${asString(project.type)} ${asString(project.platform_id)} ` +
          `by ${asString(user.name)} (weight ${typeof data.weight === 'number' ? data.weight : 1})`
      );
      break;
    case 'webhook.test':
      console.log(`Test webhook from ${asString(user.name)} for project ${asString(project.id)}`);
      break;
    default:
      console.log(`Unhandled event type: ${asString(event.type)}`);
  }

  // Any 2xx within 5 seconds acknowledges; timeouts and 5xx are retried (v1: up to 3 times).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTopGgWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/top-gg`);
  });
}
