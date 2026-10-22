// Generated with: mercury-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Mercury signs every delivery with a Mercury-Signature header:
//   t=<unix seconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the endpoint's secretKey as-is.
// https://docs.mercury.com/reference/webhooks#verifying-webhook-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MERCURY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MERCURY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

function verifyMercury(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isInteger(ts)) return false;
  // Mercury recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // MERCURY_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // secretKey used as-is, not decoded
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');
  return safeEqual(v1, expected);
}

// Raw body is required: the signature covers the exact bytes Mercury sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/mercury', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MERCURY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MERCURY_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMercury(rawBody, req.headers['mercury-signature'], secret)) {
    console.error('Mercury webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The eventTypes you subscribe to (transaction.created, ...) are not in the body.
  // The body carries resourceType + operationType ("create" | "update" | "delete").
  const key = `${event.resourceType}.${event.operationType}`;

  switch (key) {
    case 'transaction.create':
      console.log(`Transaction ${event.resourceId} created: ${event.mergePatch?.status}`);
      break;
    case 'transaction.update':
      console.log(`Transaction ${event.resourceId} updated: ${(event.changedPaths || []).join(', ')}`);
      break;
    case 'checkingAccount.update':
    case 'savingsAccount.update':
    case 'treasuryAccount.update':
    case 'creditAccount.update':
    case 'investmentAccount.update':
      console.log(`${event.resourceType} ${event.resourceId} balance updated: ${(event.changedPaths || []).join(', ')}`);
      break;
    default:
      console.log(`Unhandled event: ${key}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mercury webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyMercury };
