// Generated with: wave-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Wave sends two headers on every webhook:
// - x-wave-signature: "t=<unix seconds>,v1=<hex>", where v1 is HMAC-SHA256 of
//   "<t>.<raw body>" keyed with the webhook secret (UTF-8)
// - x-wave-timestamp: the same timestamp as a string (unsigned, so verification uses t)
// https://developer.waveapps.com/hc/en-us/articles/51070420388628-Webhooks-Setup-Guide

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set WAVE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.WAVE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`WAVE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

function verifyWave(rawBody, headers, secret) {
  if (!secret) return false;

  const signatureHeader = headers['x-wave-signature'];
  if (!signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isInteger(ts)) return false;
  // Wave recommends a 5-minute window. It's opt-in here: off unless
  // WAVE_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');
  return safeEqual(v1.toLowerCase(), expected);
}

// Raw body for any content type: the signature covers the exact bytes Wave sent
app.post('/webhooks/wave', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WAVE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyWave(rawBody, req.headers, secret)) {
    console.error('Wave webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const data = payload.data || {};

  switch (payload.event_type) {
    case 'invoice.sent':
      console.log(`Invoice ${data.invoice_id} sent to customer ${data.customer_id}`);
      break;
    case 'invoice.viewed':
      console.log(`Invoice ${data.invoice_id} viewed`);
      break;
    case 'invoice.paid':
      console.log(`Invoice ${data.invoice_id} paid: ${data.amount_paid} ${data.currency_code}`);
      break;
    case 'invoice.partially_paid':
      console.log(`Invoice ${data.invoice_id} partially paid, remaining ${data.remaining_balance}`);
      break;
    case 'invoice.overdue':
      console.log(`Invoice ${data.invoice_id} overdue, balance ${data.invoice_balance}`);
      break;
    case 'invoice.approved':
      console.log(`Invoice ${data.invoice_id} approved`);
      break;
    case 'estimate.sent':
      console.log(`Estimate ${data.estimate_id} sent`);
      break;
    case 'estimate.accepted':
      console.log(`Estimate ${data.estimate_id} accepted`);
      break;
    case 'checkout.paid':
      console.log(`Checkout ${data.checkout_id} paid: ${data.amount} ${data.currency_code}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event_type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Wave webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyWave };
