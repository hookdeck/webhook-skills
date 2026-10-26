// Generated with: bigmailer-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// BigMailer signs every event in X-BigMailer-Signature: "t=<unix seconds>,v1=<hex>"
// (more than one v1= entry can appear, e.g. during key rotation).
// Each v1 is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the endpoint's signing secret.
// https://docs.bigmailer.io/docs/verifying-webhook-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BIGMAILER_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BIGMAILER_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1492774578,v1=<hex>,v1=<hex>" -> { timestamp: '1492774578', signatures: ['<hex>', '<hex>'] }
// Only v1 is a valid scheme; any other key (v0, ...) is ignored.
function parseSignatureHeader(header) {
  const parsed = { timestamp: undefined, signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyBigMailer(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string' || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // The signed message is the t string exactly as sent, ".", then the raw body bytes.
  // The key is the secret's UTF-8 bytes, used as-is.
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  );
  return signatures.some((sig) => {
    // Exactly 64 hex characters, compared case-insensitively
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected);
  });
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Raw body is required: the signature covers the exact bytes BigMailer sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/bigmailer', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BIGMAILER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BIGMAILER_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBigMailer(rawBody, req.headers['x-bigmailer-signature'], secret)) {
    console.error('BigMailer webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Verified, but still untrusted: check every type before reading into it.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(payload)) {
    return res.status(400).send('Invalid payload');
  }

  const eventType = typeof payload.type === 'string' ? payload.type : undefined;
  // The event data sits under a key named after the type (bounce, click, ...)
  const data = eventType && isObject(payload[eventType]) ? payload[eventType] : {};

  switch (eventType) {
    case 'bounce':
      // data.type is the bounce kind (hard / soft), not the event type
      console.log(`Bounce (${data.type}) for ${data.email} on campaign ${data.campaign_id}`);
      break;
    case 'click':
      console.log(`Click by ${data.email} on ${data.url}`);
      break;
    case 'complaint':
      console.log(`Complaint from ${data.email}`);
      break;
    case 'open':
      console.log(`Open by ${data.email}`);
      break;
    case 'unsubscribe': {
      const lists = Array.isArray(data.unsubscribe_ids) ? data.unsubscribe_ids.length : 0;
      console.log(`Unsubscribe by ${data.email} (all: ${data.unsubscribe_all === true}, ${lists} lists)`);
      break;
    }
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BigMailer webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyBigMailer };
