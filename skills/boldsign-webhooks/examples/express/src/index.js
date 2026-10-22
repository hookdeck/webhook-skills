// Generated with: boldsign-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// BoldSign signs every event in X-BoldSign-Signature: "t=<unix seconds>, s0=<hex>"
// (plus ", s1=<hex>" from the old key while a secret rollover is in progress).
// Each signature is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the webhook signing secret.
// https://developers.boldsign.com/webhooks/verify-webhook-events/

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

// "t=1668693823, s0=<hex>, s1=<hex>" -> { timestamp: '1668693823', signatures: ['<hex>', '<hex>'] }
function parseSignatureHeader(header) {
  const parsed = { timestamp: undefined, signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 's0' || key === 's1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyBoldSign(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  // BoldSign suggests a short window (e.g. 5 minutes). It's opt-in here: off unless
  // BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  // s0 is the current key; s1 (old key) is only present during a rollover. Accept either.
  return signatures.some((sig) => safeEqual(sig, expected));
}

// Raw body is required: the signature covers the exact bytes BoldSign sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/boldsign', express.raw({ type: '*/*' }), (req, res) => {
  // Setup sends a "Verification" POST that must get a 200 within 10 seconds
  if (req.headers['x-boldsign-event'] === 'Verification') {
    return res.status(200).send('OK');
  }

  const secret = process.env.BOLDSIGN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BOLDSIGN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBoldSign(rawBody, req.headers['x-boldsign-signature'], secret)) {
    console.error('BoldSign webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const eventType = payload.event?.eventType;
  const doc = payload.data || {};

  switch (eventType) {
    case 'Verification':
      console.log('Verification event received');
      break;
    case 'Sent':
    case 'Viewed':
    case 'Signed':
      console.log(`Document ${doc.documentId} (${eventType}): ${doc.messageTitle}`);
      break;
    case 'Completed':
      console.log(`Document ${doc.documentId} completed by all signers`);
      break;
    case 'Declined':
      console.log(`Document ${doc.documentId} declined`);
      break;
    case 'Revoked':
    case 'Expired':
      console.log(`Document ${doc.documentId} ${eventType.toLowerCase()}`);
      break;
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BoldSign webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyBoldSign };
