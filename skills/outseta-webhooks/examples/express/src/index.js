// Generated with: outseta-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Outseta signs webhooks once you add a Webhook Signature Key:
//   x-hub-signature-256: sha256=<hex HMAC-SHA256 of the raw body>
// The key is 32 bytes you generate, written as HEX (openssl rand -hex 32):
// hex-decode it to get the HMAC key. (Decoding it as base64 gives 48 wrong bytes.)
// ---------------------------------------------------------------------------

/**
 * The key is issued hex-encoded: the HMAC key is its decoded bytes.
 * Node's hex decoder stops at the first non-hex character, so check the whole
 * string first. Surrounding whitespace (a pasted trailing newline) is trimmed.
 * @param {string|undefined} secret
 * @returns {Buffer|null}
 */
function decodeHexSecret(secret) {
  const value = String(secret || '').trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) return null;
  return Buffer.from(value, 'hex');
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given, expected) {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * @param {Buffer|string} rawBody - the exact bytes Outseta sent
 * @param {string|undefined} signature - x-hub-signature-256 ("sha256=<hex>")
 * @param {string|undefined} signatureKey - OUTSETA_WEBHOOK_SIGNATURE_KEY (hex)
 * @returns {boolean}
 */
function verifyOutsetaWebhook(rawBody, signature, signatureKey) {
  const key = decodeHexSecret(signatureKey);
  if (!key || !signature) return false;
  const match = /^sha256=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Each Outseta notification posts the record it's about (for example the
 * Person for "Person Login"). Outseta's signature article doesn't show a
 * payload, so this example only reads Uid if the record has one. Give each
 * activity its own URL (or query string) if one endpoint receives several.
 */
function handleEvent(payload) {
  const uid = payload && typeof payload === 'object' ? payload.Uid : undefined;
  console.log(`Outseta notification for record ${uid}`);
  return { received: true };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/outseta', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY;
  if (!secret) {
    console.error('OUTSETA_WEBHOOK_SIGNATURE_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeHexSecret(secret)) {
    console.error('OUTSETA_WEBHOOK_SIGNATURE_KEY is not valid hex: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid hex' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyOutsetaWebhook(rawBody, req.get('x-hub-signature-256'), secret)) {
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
    console.log(`Outseta webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/outseta`);
  });
}

module.exports = { app, verifyOutsetaWebhook, decodeHexSecret, handleEvent };
