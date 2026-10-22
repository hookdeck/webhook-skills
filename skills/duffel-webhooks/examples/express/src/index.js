// Generated with: duffel-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Duffel signs every webhook:
//   X-Duffel-Signature: t=<unix seconds>,v1=<lowercase hex>
// v1 = HMAC-SHA256 of "<t>.<raw body>", keyed with the webhook secret string's bytes as-is
// (it looks base64 but is NOT decoded).
// https://duffel.com/docs/guides/receiving-webhooks

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set DUFFEL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.DUFFEL_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`DUFFEL_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseSignatureHeader(header) {
  const parts = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyDuffel(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isInteger(ts)) return false;
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');
  return safeEqual(v1, expected);
}

// Raw body is required: the signature covers the exact bytes Duffel sent
app.post('/webhooks/duffel', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DUFFEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DUFFEL_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers['x-duffel-signature'];
  if (!signature) {
    return res.status(400).send('Missing X-Duffel-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyDuffel(rawBody, signature, secret)) {
    console.error('Duffel webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Retries can deliver duplicates: dedupe on event.idempotency_key
  switch (event.type) {
    case 'ping.triggered':
      console.log('Ping received');
      break;
    case 'order.created':
      console.log(`Order created: ${event.data?.object?.id}`);
      break;
    case 'order.airline_initiated_change_detected':
      console.log(`Airline change detected on order: ${event.data?.object?.id}`);
      break;
    case 'order_cancellation.confirmed':
      console.log(`Order cancellation confirmed: ${event.data?.object?.id}`);
      break;
    case 'payment.succeeded':
      console.log(`Payment succeeded: ${event.data?.object?.id}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Duffel webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyDuffel };
