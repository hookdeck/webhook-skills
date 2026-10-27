// Generated with: convox-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Convox signs every webhook once the `webhook_signing_key` Rack parameter is set:
//   Convox-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]
// v1 = HMAC-SHA256 of "<t>.<raw body>" as lowercase hex, keyed with the signing key's UTF-8
// bytes as-is (never hex-decoded, even if you generated it with `openssl rand -hex 32`).
// One v1 per active key (up to 4) during rotation: accept the delivery if ANY of them matches.
// https://docs.convox.com/console/webhook-signing

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set CONVOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.CONVOX_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`CONVOX_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Returns { t, sigs }: t is the raw string from the header (it goes into the signed message
// untouched), sigs is every v1= value. Other keys (v0, ...) are ignored.
function parseSignatureHeader(header) {
  let t = null;
  const sigs = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') sigs.push(value);
  }
  return { t, sigs };
}

function verifyConvox(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, sigs } = parseSignatureHeader(signatureHeader);
  if (!t || !/^\d+$/.test(t)) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  // Check the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  const candidates = sigs.filter((sig) => /^[0-9a-fA-F]{64}$/.test(sig));
  if (candidates.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest();
  return candidates.some((sig) => crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected));
}

// Raw body is required: the signature covers the exact bytes the Rack sent
app.post('/webhooks/convox', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CONVOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CONVOX_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyConvox(rawBody, req.headers['convox-signature'], secret)) {
    console.error('Convox webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Delivery is best-effort and never retried; events can arrive out of order or twice.
  // Order by event.timestamp and dedupe on event.data.tick_id + event.action.
  switch (event.action) {
    case 'app:create':
      console.log(`App created: ${event.data?.app}`);
      break;
    case 'build:create':
      if (event.status === 'error') {
        console.log(`Build failed for ${event.data?.app}: ${event.data?.message}`);
      } else {
        console.log(`Build started for ${event.data?.app}`);
      }
      break;
    case 'release:promote':
      console.log(`Promote started for ${event.data?.app}`);
      break;
    case 'app:budget:cap':
      console.log(`Budget cap crossed for ${event.data?.app}`);
      break;
    case 'app:budget:auto-shutdown:fired':
      console.log(`Auto-shutdown fired for ${event.data?.app}`);
      break;
    case 'app:budget:auto-shutdown:cancelled':
      console.log(`Auto-shutdown cancelled for ${event.data?.app}: ${event.data?.cancel_reason}`);
      break;
    default:
      // The docs say to ignore unknown actions (35 documented, more may follow)
      console.log(`Unhandled action: ${event.action}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Convox webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyConvox };
