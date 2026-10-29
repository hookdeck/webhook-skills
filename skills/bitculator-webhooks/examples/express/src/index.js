// Generated with: bitculator-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Bitculator signs every delivery:
//   X-Bitculator-Signature: t=<unix seconds>,v1=<hex>
// v1 = HMAC-SHA256 of "<t>.<raw body>" in hex, keyed with the whole secret string's UTF-8 bytes
// (the whsec_ prefix included; not base64-decoded). <t> is used exactly as it appears in the header.
// https://bitculator.com/en/documentation/api/v1

// Optional replay window in seconds, off by default (unset or 0). Bitculator's own example accepts a
// delivery only when |now - t| < 300; set BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=300 to match that when
// Bitculator calls you directly. Behind Hookdeck leave it off: Hookdeck retries and replays resend
// the original timestamp, so a window rejects legitimate redeliveries.
// An invalid value leaves the check off, with a warning.
const DEFAULT_TOLERANCE_SECONDS = 0;
let warnedInvalidTolerance = false;
function toleranceSeconds() {
  const raw = (process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return DEFAULT_TOLERANCE_SECONDS;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

// "t=1700000000,v1=abc" -> { t: '1700000000', v1: ['abc'] } (any number of v1 entries; other keys ignored)
function parseSignatureHeader(header) {
  const parsed = { t: undefined, v1: [] };
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') parsed.t = value;
    else if (key === 'v1') parsed.v1.push(value);
  }
  return parsed;
}

// rawBody: Buffer of the exact bytes received
function verifyBitculator(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !/^[0-9]+$/.test(t)) return false;

  const tolerance = toleranceSeconds();
  if (tolerance > 0 && !(Math.abs(Math.floor(Date.now() / 1000) - Number(t)) < tolerance)) {
    return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  return v1.some((sig) => {
    // Exactly 64 hex characters (case-insensitive) before comparing
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    const candidate = Buffer.from(sig.toLowerCase());
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x) => (typeof x === 'string' ? x : undefined);

// Bitculator POSTs each event as JSON. Raw body is required: the signature covers the exact bytes
// Bitculator sent, so read them with express.raw (type: '*/*' verifies whatever Content-Type arrives).
app.post('/webhooks/bitculator', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BITCULATOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BITCULATOR_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers['x-bitculator-signature'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!signature || !verifyBitculator(rawBody, signature, secret)) {
    console.error('Bitculator webhook signature verification failed');
    return res.status(401).send('Unauthorized');
  }

  // X-Bitculator-Event names the event (alarm.triggered). It is NOT covered by the signature, so read
  // it only after verifying and use it as a routing label. Without it, assume alarm.triggered, the
  // only event Bitculator offers. Acknowledge and skip events this handler doesn't know.
  const header = req.headers['x-bitculator-event'];
  const type = typeof header === 'string' && header !== '' ? header : 'alarm.triggered';
  if (type !== 'alarm.triggered') {
    console.log(`Skipping unhandled event: ${type}`);
    return res.json({ received: true });
  }

  // The body is documented as JSON, but its fields are not (only `test: true` on test deliveries):
  // parse defensively and don't depend on any field.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.log('Verified Bitculator delivery with a non-JSON body');
    return res.json({ received: true });
  }
  if (!isObject(event)) {
    console.log('Verified Bitculator delivery whose JSON body is not an object');
    return res.json({ received: true });
  }

  // `test: true` marks a delivery from POST /api/v1/webhooks/{id}/test.
  const isTest = event.test === true;
  // Illustrative shape: data.alarm mirrors an item of GET /api/v1/alarms. Check every type.
  const alarm = isObject(event.data) && isObject(event.data.alarm) ? event.data.alarm : {};
  const coin = isObject(alarm.coin) ? alarm.coin : {};
  console.log(
    `${isTest ? 'Test ' : ''}alarm triggered: ${str(alarm.name) ?? '(unnamed)'} ` +
      `${str(coin.symbol) ?? ''} ${str(alarm.direction) ?? ''} ${str(alarm.target) ?? ''}`.trimEnd()
  );
  // TODO: notify, trade or update dashboards; deduplicate, since deliveries are retried

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bitculator webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyBitculator };
