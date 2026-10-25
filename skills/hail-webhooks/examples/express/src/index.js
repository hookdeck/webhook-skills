// Generated with: hail-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Hail signs every delivery with an X-Hail-Signature header:
//   t=<unix>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the whole signing secret
// (including whsec_) as UTF-8. This is NOT Standard Webhooks: no svix / standardwebhooks library,
// no stripping or base64-decoding of the whsec_ prefix.
// https://hail.so/docs/webhooks

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
// original timestamp, so a window would reject late redeliveries (Hail re-signs its own retries).
// Set HAIL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.HAIL_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`HAIL_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=...,v1=..." -> { t, v1: [...] }. Parts are trimmed (a space after the comma is allowed) and
// every v1 is collected (Hail sends one; accepting any match is harmless).
function parseSignatureHeader(header) {
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyHail(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  // Opt-in only: off unless HAIL_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', secret) // whole secret incl. whsec_, used as-is
      .update(`${t}.`)
      .update(rawBody)
      .digest('hex')
  );
  // Accept if any v1 matches. Require exactly 64 hex chars first, then compare the lowercase hex
  // strings as equal-length buffers in constant time.
  return v1.some(
    (v) => /^[0-9a-f]{64}$/i.test(v) && crypto.timingSafeEqual(Buffer.from(v.toLowerCase()), expected)
  );
}

// Raw body is required: the signature covers the exact bytes Hail sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/hail', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HAIL_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyHail(rawBody, req.headers['x-hail-signature'], secret)) {
    console.error('Hail webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Dedupe on the X-Hail-Delivery header (stable across retries) or event.id before side effects.
  const data = event.data || {};
  switch (event.type) {
    case 'email.received':
      console.log(`Email received from ${data.from_address}: ${data.subject}`);
      break;
    case 'email.received.suppressed':
      console.log(`Inbound email ${data.id} suppressed: ${data.reason}`);
      break;
    case 'email.delivered':
      console.log(`Email ${data.id} delivered`);
      break;
    case 'email.delivery_delayed':
      console.log(`Email ${data.id} delivery delayed`);
      break;
    case 'email.bounced':
      console.log(`Email ${data.id} bounced (hard: ${data.detail?.hard})`);
      break;
    case 'email.complained':
      console.log(`Email ${data.id} marked as spam`);
      break;
    case 'email.opened':
      console.log(`Email ${data.id} opened`);
      break;
    case 'email.clicked':
      console.log(`Email ${data.id} link clicked: ${data.detail?.link}`);
      break;
    case 'email.send_failed':
      console.log(`Email ${data.id} failed to send`);
      break;
    case 'sms.received':
      console.log(`SMS from ${data.from}: ${data.body}`);
      break;
    case 'sms.delivered':
      console.log(`SMS ${data.id} delivered`);
      break;
    case 'sms.undelivered':
      console.log(`SMS ${data.id} undelivered`);
      break;
    case 'sms.failed':
      console.log(`SMS ${data.id} failed`);
      break;
    case 'call.received':
    case 'call.answered':
    case 'call.completed':
    case 'call.failed':
    case 'call.busy':
    case 'call.no_answer':
    case 'call.transferred':
      console.log(`${event.type}: call ${data.id} (${data.direction}) ${data.from} -> ${data.to}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Hail webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyHail };
