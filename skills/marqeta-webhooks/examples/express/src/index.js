// Generated with: marqeta-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Marqeta authenticates every webhook with HTTP Basic auth, using the
// basic_auth_username and basic_auth_password set on the webhook (both
// required). If the webhook also has a secret and signature_algorithm,
// Marqeta adds X-Marqeta-Signature: the lowercase hex HMAC-SHA256 (or legacy
// HMAC-SHA1) of the raw body. Set MARQETA_WEBHOOK_SECRET to check it too.
// ---------------------------------------------------------------------------

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given, expected) {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** Check the Authorization header against the webhook's Basic auth credentials. */
function verifyBasicAuth(authorization, username, password) {
  if (!username || !password) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization || ''));
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':'); // the password may contain ':'
  if (separator < 0) return false;
  const userOk = safeEqual(decoded.slice(0, separator), username);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

const HEX_LENGTH = { sha256: 64, sha1: 40 };

/** "sha256" (default), "sha1", or "sha256,sha1" while you switch algorithms. */
function parseAlgorithms(value) {
  const list = String(value || 'sha256').toLowerCase().split(',').map((a) => a.trim()).filter(Boolean);
  return list.filter((a) => HEX_LENGTH[a]);
}

/**
 * Verify X-Marqeta-Signature: hex HMAC of the exact raw body.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Marqeta-Signature
 * @param {string} secret - the webhook's secret (MARQETA_WEBHOOK_SECRET)
 * @param {string[]} algorithms - from MARQETA_SIGNATURE_ALGORITHM
 */
function verifyMarqetaSignature(rawBody, signature, secret, algorithms = ['sha256']) {
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]+$/.test(value)) return false;
  const given = Buffer.from(value, 'hex');
  let ok = false;
  for (const algorithm of algorithms) {
    if (value.length !== HEX_LENGTH[algorithm]) continue;
    const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest();
    ok = crypto.timingSafeEqual(given, expected) || ok;
  }
  return ok;
}

/** True for Marqeta's health check: {"pings":[{"token":"marqeta","payload":"healthcheck"}]}. */
function isPing(message) {
  return Array.isArray(message.pings);
}

/**
 * The body is keyed by notification type, each holding up to 10 notifications
 * of that type: { "transactions": [...] }, { "cards": [...] },
 * { "usertransitions": [...] }, { "chargebacktransitions": [...] } and so on.
 * Each notification has its own token: dedupe on it. Order isn't guaranteed:
 * use created_time.
 */
function handleNotifications(message) {
  const counts = {};
  for (const [type, notifications] of Object.entries(message)) {
    if (!Array.isArray(notifications)) continue;
    counts[type] = notifications.length;
    for (const notification of notifications) {
      if (type === 'transactions') {
        console.log(`Transaction ${notification.token}: ${notification.type} ${notification.state} ${notification.amount}`);
      } else {
        console.log(`${type} ${notification.token}: ${notification.type || notification.state || ''}`);
      }
    }
  }
  return { received: true, counts };
}

// express.raw() keeps the exact bytes for the optional HMAC: don't use express.json() here.
app.post('/webhooks/marqeta', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const username = process.env.MARQETA_WEBHOOK_USERNAME;
  const password = process.env.MARQETA_WEBHOOK_PASSWORD;
  if (!username || !password) {
    console.error('MARQETA_WEBHOOK_USERNAME and MARQETA_WEBHOOK_PASSWORD must both be set: rejecting request');
    return res.status(500).json({ error: 'Webhook credentials not configured' });
  }

  if (!verifyBasicAuth(req.get('authorization'), username, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const secret = (process.env.MARQETA_WEBHOOK_SECRET || '').trim();
  if (secret) {
    const algorithms = parseAlgorithms(process.env.MARQETA_SIGNATURE_ALGORITHM);
    if (!verifyMarqetaSignature(rawBody, req.get('x-marqeta-signature'), secret, algorithms)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let message;
  try {
    message = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!message || typeof message !== 'object') message = {};

  // Anything but 200 is a failure that Marqeta retries (except pings).
  if (isPing(message)) return res.status(200).json({ received: true, ping: true });
  return res.status(200).json(handleNotifications(message));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Marqeta webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/marqeta`);
  });
}

module.exports = { app, verifyBasicAuth, verifyMarqetaSignature, parseAlgorithms, handleNotifications };
