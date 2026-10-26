// Generated with: xtremepush-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// With the Signed Payload auth type, Xtremepush adds an X-Xtremepush-Signature header:
//   t=<unix seconds>, v1=<hex>[, v1=<hex>]
// Each v1 is HMAC-SHA256 (hex) of "<t>.<JSON body>", keyed with the Webhook Secret Key as UTF-8.
// A second v1 appears for up to 24 hours after the key is replaced.
// https://docs.xtremepush.com/docs/verify-webhook-signatures

// The docs don't name the HTTP method, so every common method is accepted (signature checked first).
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Optional replay window in seconds. Off by default (unset or 0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',' and trim each part (entries are separated by ", ");
// keep t as the exact string and every v1, ignore other keys such as v0.
function parseSignatureHeader(header) {
  let t;
  const v1 = [];
  for (const part of header.split(',')) {
    const p = part.trim();
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const key = p.slice(0, i).trim();
    const value = p.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyXtremepush(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0) return false;

  // Opt-in replay window: off unless XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', secret) // Webhook Secret Key as UTF-8, not decoded
      .update(`${t}.`) // t exactly as it appears in the header
      .update(rawBody) // the exact request bytes
      .digest('hex')
  );
  // Accept if any v1 matches. Check it is exactly 64 hex chars first, then compare the
  // lowercase hex strings as equal-length Buffers in constant time.
  return v1.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected)
  );
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The body is untrusted even after the signature check: confirm each type before reading into it.
function handleEvent(payload) {
  if (!isObject(payload)) {
    console.log('Ignoring Xtremepush body that is not a JSON object');
    return;
  }
  const event = typeof payload.event === 'string' ? payload.event : undefined;
  const properties = isObject(payload.properties) ? payload.properties : {};

  // A connection's "Custom format" can rename or drop `event`; the default body is event/time/properties.
  switch (event) {
    case 'message_send':
      console.log('Xtremepush message_send event', Object.keys(properties));
      // TODO: record that the campaign message was sent to this recipient
      break;
    case 'message_delivery':
      console.log('Xtremepush message_delivery event', Object.keys(properties));
      // TODO: record that the campaign message was delivered
      break;
    default:
      console.log(`Unhandled Xtremepush event: ${event}`);
  }
}

// Raw body is required: the signature covers the exact bytes Xtremepush sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.all('/webhooks/xtremepush', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.XTREMEPUSH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('XTREMEPUSH_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  // Verify first, for every method. A request with no body is verified over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyXtremepush(rawBody, req.headers['x-xtremepush-signature'], secret)) {
    console.error('Xtremepush webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).send('Method not allowed');
  }

  // A verified request with no body is acknowledged, not rejected as invalid JSON.
  if (rawBody.length > 0) {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    handleEvent(payload);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Xtremepush webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyXtremepush };
