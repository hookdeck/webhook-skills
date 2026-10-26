// Generated with: nooks-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Nooks signs every delivery after activation with an x-webhook-signature header:
//   t=<unix milliseconds>,s=<base64>
// s is the base64 HMAC-SHA256 of "<t>.<raw body>" (t exactly as sent), keyed with the signing key
// as a UTF-8 string.
// https://nooks.help.usepylon.com/articles/8109690071-nooks-webhooks-integration-guide

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set NOOKS_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`NOOKS_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Split on ',' then on the FIRST '=' only: base64 signatures end in '='.
function parseSignatureHeader(header) {
  const parts = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyNooks(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, s } = parseSignatureHeader(signatureHeader);
  if (!t || !s || !/^\d+$/.test(t)) return false;

  // Nooks recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // NOOKS_TIMESTAMP_TOLERANCE_SECONDS > 0. t is in milliseconds.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Date.now() - Number(t)) / 1000 > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // signing key used as-is, as UTF-8
    .update(`${t}.`)
    .update(rawBody)
    .digest('base64');
  return safeEqual(s, expected);
}

// Raw body is required: the signature covers the exact bytes Nooks sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/nooks', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  // The one-time activation ping Nooks sends when you save the URL may be unsigned, and it must get
  // a 2xx. Unsigned requests are rejected unless NOOKS_ACCEPT_UNSIGNED_PING=true, which you set only
  // while activating a URL that points straight at this app (no signing key exists yet). Even then
  // they are acknowledged, never processed.
  if (!signature) {
    if (process.env.NOOKS_ACCEPT_UNSIGNED_PING === 'true') {
      console.log('Unsigned request acknowledged (activation ping); not processed');
      return res.status(200).json({ received: true });
    }
    return res.status(401).send('Missing x-webhook-signature header');
  }

  const secret = process.env.NOOKS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('NOOKS_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyNooks(rawBody, signature, secret)) {
    console.error('Nooks webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const eventType = event?.event;
  switch (eventType) {
    case 'call.logged': {
      // De-duplicate on callData.callId (stable across retries), never on eventId (one per attempt)
      const call = event.callData || {};
      console.log(`Call ${call.callId} logged: ${call.status}, disposition ${call.disposition?.name}`);
      break;
    }
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Nooks webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyNooks };
