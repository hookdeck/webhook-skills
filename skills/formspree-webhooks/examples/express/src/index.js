// Generated with: formspree-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]+$/;

/**
 * Parse Formspree-Signature: "t=<unix>,v1=<hex>". The header can carry more
 * than one v1= entry (key rotation) and other keys such as v0, which are ignored.
 */
function parseSignatureHeader(header) {
  let timestamp;
  let timestampCount = 0;
  const signatures = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  return { timestamp, timestampCount, signatures };
}

/** Opt-in replay window in seconds. Unset, 0 or invalid = off (the default). */
function toleranceFromEnv() {
  const seconds = Number(process.env.FORMSPREE_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Verify a Formspree webhook signature.
 *
 * Signed content: `${t}.` + raw body bytes (t exactly as it appears in the header)
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
 */
function verifyFormspreeSignature(
  rawBody,
  header,
  secret,
  toleranceSeconds = toleranceFromEnv(),
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!header) {
    return { valid: false, error: 'Missing Formspree-Signature header' };
  }

  const { timestamp, timestampCount, signatures } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !timestamp || signatures.length === 0) {
    return { valid: false, error: 'Malformed Formspree-Signature header' };
  }

  if (toleranceSeconds > 0) {
    if (!DECIMAL.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Only well-formed candidates reach Buffer.from(..., 'hex'), which would
  // otherwise silently drop bad characters.
  const candidates = signatures.filter((sig) => HEX_64.test(sig));
  if (candidates.length === 0) {
    return { valid: false, error: 'Malformed Formspree-Signature header' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  // Accept when ANY v1 entry matches; check them all so timing doesn't reveal which.
  let matched = false;
  for (const sig of candidates) {
    const received = Buffer.from(sig.toLowerCase(), 'hex');
    matched = crypto.timingSafeEqual(received, expected) || matched;
  }

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Retries resend identical bytes, so the body hash identifies a delivery.
// Use a shared store (Redis, a unique DB column) in production.
const seenDeliveries = new Set();
const deliveryKey = (rawBody) => crypto.createHash('sha256').update(rawBody).digest('hex');

/**
 * Every delivery is a new form submission: there is no event name field or header.
 * Treat every field as untrusted even after the signature check.
 */
function handleSubmission(payload) {
  const form = typeof payload.form === 'string' ? payload.form : undefined;
  const keys = Array.isArray(payload.keys) ? payload.keys.filter((k) => typeof k === 'string') : [];
  const submission = isPlainObject(payload.submission) ? payload.submission : {};

  const date = typeof submission._date === 'string' ? submission._date : undefined;
  console.log(`Form submission on ${form ?? 'unknown form'} at ${date ?? 'unknown time'}`);

  for (const key of keys) {
    const value = submission[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      console.log(`  ${key}: ${value}`);
    }
  }
}

// Formspree webhook endpoint. express.raw with '*/*' keeps the exact signed bytes
// whatever the content type is.
app.post('/webhooks/formspree', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FORMSPREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FORMSPREE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Build Hooks send an empty body, so there may be no parsed body at all.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // 1. Verify first, on the raw bytes.
  const verification = verifyFormspreeSignature(rawBody, req.get('formspree-signature'), secret);
  if (!verification.valid) {
    console.error('Formspree webhook verification failed:', verification.error);
    return res.status(401).json({ error: verification.error });
  }

  // 2. Build Hook: valid delivery, nothing to read.
  if (rawBody.length === 0) {
    return res.status(200).json({ received: true });
  }

  // 3. Parse only now.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  if (!isPlainObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  // 4. Retries can duplicate a submission: skip ones already handled.
  const key = deliveryKey(rawBody);
  if (seenDeliveries.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }
  seenDeliveries.add(key);

  // Answer within 3 seconds: in production, persist or queue here, then process async.
  handleSubmission(payload);

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFormspreeSignature = verifyFormspreeSignature;
module.exports.parseSignatureHeader = parseSignatureHeader;
module.exports.seenDeliveries = seenDeliveries;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/formspree`);
  });
}
