// Generated with: employment-hero-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Employment Hero signs each webhook with two headers:
//   X-EmploymentHero-Timestamp: <timestamp>
//   X-EmploymentHero-Signature: <base64 HMAC-SHA256 of "<timestamp>.<raw body>">
// The secret key from the Developer Portal is base64: decode it to get the HMAC key.
// ---------------------------------------------------------------------------

/**
 * The secret is issued base64-encoded: the HMAC key is its decoded bytes.
 * Node's base64 decoder skips characters it doesn't know and ignores stray
 * bits, so insist on canonical base64 instead of keying with the wrong bytes.
 * Surrounding whitespace (a pasted trailing newline) is trimmed.
 * @param {string|undefined} secret
 * @returns {Buffer|null}
 */
function decodeBase64Secret(secret) {
  const value = String(secret || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given, expected) {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * @param {Buffer|string} rawBody - the exact bytes Employment Hero sent
 * @param {string|undefined} signature - X-EmploymentHero-Signature (bare base64)
 * @param {string|undefined} timestamp - X-EmploymentHero-Timestamp
 * @param {string|undefined} secret - EMPLOYMENT_HERO_WEBHOOK_SECRET (base64, as shown)
 * @returns {boolean}
 */
function verifyEmploymentHeroWebhook(rawBody, signature, timestamp, secret) {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest('base64');
  // Employment Hero's sample compares the base64 strings (secure_compare).
  return bytesEqual(Buffer.from(signature.trim(), 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Employment Hero doesn't publish a payload format, so this example assumes no
 * field. Log the top-level keys of the first real delivery, then dispatch on the
 * field that names the event. A hash of the raw body makes a dedupe key that
 * doesn't depend on the payload's fields (Employment Hero retries up to 3 times).
 */
function handleEvent(payload, rawBody) {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  const dedupeKey = crypto.createHash('sha256').update(rawBody).digest('hex');
  console.log(`Employment Hero webhook ${dedupeKey.slice(0, 16)} with fields: ${fields.join(', ')}`);
  return { received: true };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/employment-hero', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EMPLOYMENT_HERO_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('EMPLOYMENT_HERO_WEBHOOK_SECRET is not valid base64: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyEmploymentHeroWebhook(
      rawBody,
      req.get('x-employmenthero-signature'),
      req.get('x-employmenthero-timestamp'),
      secret
    )) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  return res.status(200).json(handleEvent(payload, rawBody));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Employment Hero webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/employment-hero`);
  });
}

module.exports = { app, verifyEmploymentHeroWebhook, decodeBase64Secret, handleEvent };
