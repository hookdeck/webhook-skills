// Generated with: exa-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Exa-Signature: "t=<unix seconds>,v1=<hex>[,v1=<hex>...]"
// v1 = HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook secret (UTF-8 string).
// https://docs.exa.ai/websets/api/webhooks/verifying-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set EXA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.EXA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`EXA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

// The header may carry several v1 values (e.g. during secret rotation)
function parseSignatureHeader(header) {
  let timestamp;
  const signatures = [];
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

function verifyExa(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return signatures.some((sig) => safeEqual(sig, expected));
}

// Raw body is required: the signature covers the exact bytes Exa sent
app.post('/webhooks/exa', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.EXA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EXA_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signatureHeader = req.headers['exa-signature'];
  if (!signatureHeader) {
    return res.status(400).send('Missing Exa-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyExa(rawBody, signatureHeader, secret)) {
    console.error('Exa webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Exa events: { id, object: "event", type, data, createdAt }
  switch (event.type) {
    case 'webset.created':
      console.log(`Webset created: ${event.data?.id}`);
      break;
    case 'webset.idle':
      console.log(`Webset idle: ${event.data?.id}`);
      break;
    case 'webset.search.completed':
      console.log(`Search completed: ${event.data?.id}`);
      break;
    case 'webset.item.created':
      console.log(`Item created: ${event.data?.id}`);
      break;
    case 'webset.item.enriched':
      console.log(`Item enriched: ${event.data?.id}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Exa webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyExa };
