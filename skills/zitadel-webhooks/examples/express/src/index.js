// Generated with: zitadel-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ZITADEL Actions v2 targets with the JSON payload type sign every request in the
// ZITADEL-Signature header: "t=<unix seconds>,v1=<hex>" (one v1 per signing key).
// v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw body>", keyed with the target's signingKey (UTF-8 bytes).
// https://zitadel.com/docs/guides/integrate/actions/testing-request-signature
// JWT and JWE payload types are not signed this way and are not covered here.

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set ZITADEL_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ZITADEL_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1700000000,v1=<hex>,v1=<hex>,v0=<ignored>" -> { timestamp: '1700000000', signatures: ['<hex>', '<hex>'] }
// The timestamp stays a string: it is part of the signed message exactly as sent.
function parseSignatureHeader(header) {
  const parsed = { timestamp: undefined, signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't' && parsed.timestamp === undefined) parsed.timestamp = value;
    else if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyZitadel(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  // Opt-in only: off unless ZITADEL_WEBHOOK_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // Signed message as bytes: "<t>." followed by the raw body bytes, untouched.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  // A header can carry several v1 entries (key rotation); any one matching is enough.
  return signatures.some((sig) => {
    // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    const received = Buffer.from(sig.toLowerCase(), 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// event_payload is documented as base64-encoded JSON; accept an already-decoded object too.
function decodeEventPayload(value) {
  if (isObject(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return isObject(decoded) ? decoded : {};
  } catch {
    return {};
  }
}

function handleEvent(payload) {
  const eventType = payload.event_type;
  const eventPayload = decodeEventPayload(payload.event_payload);
  const aggregate = `${typeof payload.aggregateType === 'string' ? payload.aggregateType : '?'}/${typeof payload.aggregateID === 'string' ? payload.aggregateID : '?'}`;

  switch (eventType) {
    case 'user.human.added':
      console.log(`Human user added (${aggregate}): ${typeof eventPayload.userName === 'string' ? eventPayload.userName : 'unknown'}`);
      break;
    case 'session.added':
      console.log(`Session added (${aggregate})`);
      break;
    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Raw body is required: the signature covers the exact bytes ZITADEL sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/zitadel', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ZITADEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZITADEL_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyZitadel(rawBody, req.headers['zitadel-signature'], secret)) {
    console.error('ZITADEL webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Verified. Everything in the body is still untrusted input: check types before using a field.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(payload)) {
    return res.status(400).send('Expected a JSON object');
  }

  // Event executions carry event_type, request/response executions carry fullMethod,
  // function executions carry function. Dispatch on whichever is present.
  if (typeof payload.event_type === 'string') {
    handleEvent(payload);
  } else if (typeof payload.fullMethod === 'string') {
    console.log(`Request/response execution: ${payload.fullMethod}`);
  } else if (typeof payload.function === 'string') {
    console.log(`Function execution: ${payload.function}`);
  } else {
    console.log('Unhandled ZITADEL payload');
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ZITADEL webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyZitadel };
