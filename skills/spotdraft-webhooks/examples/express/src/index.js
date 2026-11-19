// Generated with: spotdraft-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// SpotDraft signs each webhook with one header:
//   X-SD-WEBHOOK-CONTENT-HASH: <hex HMAC-SHA512 of the raw body>
// The key is the hmac_key from GET /api/v2.1/public/webhooks/hmac_key/. It's
// base64: decode it to get the HMAC key.
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
 * @param {Buffer|string} rawBody - the exact bytes SpotDraft sent
 * @param {string|undefined} contentHash - X-SD-WEBHOOK-CONTENT-HASH (hex)
 * @param {string|undefined} hmacKey - SPOTDRAFT_HMAC_KEY (base64, as returned by the API)
 * @returns {boolean}
 */
function verifySpotDraftWebhook(rawBody, contentHash, hmacKey) {
  const key = decodeBase64Secret(hmacKey);
  const given = String(contentHash || '').trim();
  if (!key || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(given, 'hex'), expected);
}

/**
 * SpotDraft's webhook guides don't publish the payload fields, so this example
 * assumes none. Log the top-level keys of the first real delivery, then dispatch
 * on the field that carries the activity (CONTRACT_CREATED, CONTRACT_EXECUTED,
 * ...). SpotDraft suggests deduplicating by delivery id or payload fingerprint;
 * a hash of the raw body is a fingerprint that doesn't depend on field names.
 */
function handleEvent(payload, rawBody) {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  const fingerprint = crypto.createHash('sha256').update(rawBody).digest('hex');
  console.log(`SpotDraft webhook ${fingerprint.slice(0, 16)} with fields: ${fields.join(', ')}`);
  return { received: true };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/spotdraft', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.SPOTDRAFT_HMAC_KEY;
  if (!secret) {
    console.error('SPOTDRAFT_HMAC_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('SPOTDRAFT_HMAC_KEY is not valid base64: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySpotDraftWebhook(rawBody, req.get('x-sd-webhook-content-hash'), secret)) {
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
    console.log(`SpotDraft webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/spotdraft`);
  });
}

module.exports = { app, verifySpotDraftWebhook, decodeBase64Secret, handleEvent };
