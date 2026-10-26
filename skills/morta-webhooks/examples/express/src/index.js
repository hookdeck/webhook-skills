// Generated with: morta-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MORTA_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MORTA_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Morta webhook signature.
 *
 * Header: `Morta-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the hub signing secret as UTF-8 text.
 * More than one v1 may be present (key rotation): any match is enough. Other keys are ignored.
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `Morta-Signature` header value
 * @param {string} secret - Hub signing secret
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether the signature is valid (and fresh, when a tolerance is set)
 */
function verifyMortaWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  // `t` is signed exactly as it appears in the header: keep it a string
  const t = pairs.find(([k]) => k === 't')?.[1];
  // Validate the format (64 hex chars) before comparing; skip other keys such as v0
  const signatures = pairs
    .filter(([k, v]) => k === 'v1' && HEX_SHA256.test(v))
    .map(([, v]) => v.toLowerCase());
  if (!t || signatures.length === 0) return false;

  // Opt-in replay window (`t` is Unix seconds)
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  // Both sides are 64 ASCII bytes, so timingSafeEqual cannot throw on length
  return signatures.some((sig) => crypto.timingSafeEqual(Buffer.from(sig), expected));
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// `change` is a JSON-encoded string (or null): parse it a second time, tolerating bad data
function parseChange(change) {
  if (typeof change !== 'string') return null;
  try {
    const parsed = JSON.parse(change);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Dispatch on the body's `event` field. Every field is untrusted: check its type before use.
function handleEvent(body) {
  const { event, resourceId, context } = body;
  const change = parseChange(body.change);
  const id = typeof resourceId === 'string' ? resourceId : 'unknown';
  const ctx = isObject(context) ? context : {};

  switch (event) {
    case 'table.row_created': {
      const rows = Array.isArray(ctx.rows) ? ctx.rows.length : 0;
      const added = typeof change?.added === 'number' ? change.added : rows;
      console.log(`Table ${id}: ${added} row(s) created`);
      break;
    }
    case 'table.row_updated':
      console.log(`Table ${id}: row(s) updated`);
      break;
    case 'project.created':
      console.log(`Hub created: ${id}`);
      break;
    case 'project.duplication_failed':
      console.log(`Hub duplication failed for ${id}: ${typeof change?.error === 'string' ? change.error : 'unknown error'}`);
      break;
    case 'member.created':
      console.log(`Member added to hub ${id}`);
      break;
    case 'process.response_submitted':
      console.log(`Document response submitted: ${id}`);
      break;
    default:
      console.log(`Unhandled event type: ${typeof event === 'string' ? event : 'missing'}`);
  }
  // TODO: persist / forward. `id` (the event's unique public ID) is a good idempotency key.
}

// Morta webhook endpoint - must use the raw body for signature verification.
// '*/*' reads the exact bytes whatever the content type is.
app.post('/webhooks/morta', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['morta-signature'];
  const secret = process.env.MORTA_WEBHOOK_SECRET;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!secret) {
    console.error('MORTA_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!header || !verifyMortaWebhook(rawBody, header, secret)) {
    console.error('Morta webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification, and treat the result as untrusted
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(body)) {
    return res.status(400).send('Expected a JSON object');
  }

  handleEvent(body);

  // Any 2xx acknowledges, and Morta expects it within 10 seconds
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMortaWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/morta`);
  });
}
