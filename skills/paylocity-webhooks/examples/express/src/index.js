// Generated with: paylocity-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Paylocity signs each webhook with two headers:
//   x-pcty-timestamp: <unix seconds>
//   x-pcty-signature: keyId=<uuid>:signature=<hex>[,keyId=<uuid>:signature=<hex>]
// Each signature is hex(HMAC-SHA256(base64Decode(secret), "<timestamp>.<raw body>")).
// While a subscription has two active keys, every delivery carries one pair per
// key, so a single stored secret matches one of them.
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
 * Split x-pcty-signature into its keyId/signature pairs.
 * @param {string|undefined} header
 * @returns {{keyId: string, signature: string}[]}
 */
function parsePaylocitySignatures(header) {
  return String(header || '')
    .split(',')
    .map((pair) => /^\s*keyId=([^:,\s]+):signature=((?:[0-9a-fA-F]{2})+)\s*$/.exec(pair))
    .filter(Boolean)
    .map((match) => ({ keyId: match[1], signature: match[2] }));
}

/**
 * @param {Buffer|string} rawBody - the exact bytes Paylocity sent
 * @param {string|undefined} signatureHeader - x-pcty-signature
 * @param {string|undefined} timestamp - x-pcty-timestamp (unix seconds)
 * @param {string|undefined} secret - PAYLOCITY_HMAC_SECRET (base64, as returned)
 * @param {{toleranceSeconds?: number, now?: number}} [options] - toleranceSeconds > 0 turns on
 *   Paylocity's recommended age check (300 seconds); off by default
 * @returns {boolean}
 */
function verifyPaylocityWebhook(rawBody, signatureHeader, timestamp, secret, options = {}) {
  const { toleranceSeconds = 0, now = Date.now() / 1000 } = options;
  const key = decodeBase64Secret(secret);
  if (!key || !signatureHeader || !timestamp) return false;
  if (toleranceSeconds > 0) {
    const age = Math.abs(now - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  }
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();
  // Accept the delivery if any pair matches: during rotation one is signed with each key.
  return parsePaylocitySignatures(signatureHeader).some(({ signature }) =>
    bytesEqual(Buffer.from(signature, 'hex'), expected)
  );
}

/**
 * Paylocity payloads are CloudEvents-style: id, type, time and data. The data
 * fields depend on the event type (see Paylocity's Webhook Event Types page).
 */
function handleEvent(payload) {
  const { id, type } = payload && typeof payload === 'object' ? payload : {};
  switch (type) {
    case 'employee.assignment.v1':
      console.log(`Paylocity assignment change ${id}`);
      break;
    case 'employee.assignment.status.v1':
      console.log(`Paylocity assignment status change ${id}`);
      break;
    default:
      console.log(`Paylocity ${type} event ${id}`);
  }
  // Delivery is at least once: use id to skip duplicates.
  return { received: true, type: type ?? null };
}

/** PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS, or 0 (no age check). */
function toleranceSeconds() {
  return Number(process.env.PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS) || 0;
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/paylocity', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.PAYLOCITY_HMAC_SECRET;
  if (!secret) {
    console.error('PAYLOCITY_HMAC_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('PAYLOCITY_HMAC_SECRET is not valid base64: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyPaylocityWebhook(rawBody, req.get('x-pcty-signature'), req.get('x-pcty-timestamp'), secret, {
      toleranceSeconds: toleranceSeconds(),
    })) {
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
    console.log(`Paylocity webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paylocity`);
  });
}

module.exports = { app, verifyPaylocityWebhook, parsePaylocitySignatures, decodeBase64Secret, handleEvent };
