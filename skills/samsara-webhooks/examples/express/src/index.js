// Generated with: samsara-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Samsara signs each webhook with two headers:
//   X-Samsara-Timestamp: <unix seconds>
//   X-Samsara-Signature: v1=<hex HMAC-SHA256 of "v1:<timestamp>:<raw body>">
// The secret key on the webhook's page is base64: decode it to get the HMAC key.
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
 * @param {Buffer|string} rawBody - the exact bytes Samsara sent
 * @param {string|undefined} signature - X-Samsara-Signature
 * @param {string|undefined} timestamp - X-Samsara-Timestamp
 * @param {string|undefined} secret - SAMSARA_WEBHOOK_SECRET (base64, as shown)
 * @returns {boolean}
 */
function verifySamsaraWebhook(rawBody, signature, timestamp, secret) {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  // "v1" is the only signature version; any other prefix is not from Samsara.
  const match = /^v1=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`v1:${timestamp}:`, 'utf8')
    .update(rawBody)
    .digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Two payload shapes share eventId and eventType:
 * - Webhooks 1.0 (alerts, and Ping from the Test button): eventMs (epoch ms) and event.
 * - Webhooks 2.0 Event Subscriptions (e.g. DvirSubmitted): eventTime (RFC 3339),
 *   orgId, webhookId and data.
 */
function handleEvent(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const { eventId, eventType } = body;
  const details = body.data !== undefined ? body.data : body.event; // 2.0 data, 1.0 event
  const occurredAt =
    body.eventTime || (typeof body.eventMs === 'number' ? new Date(body.eventMs).toISOString() : null);
  switch (eventType) {
    case 'Ping':
      console.log(`Samsara test ping ${eventId}`);
      break;
    case 'Alert':
      console.log(`Samsara alert ${eventId} at ${occurredAt}`, details);
      break;
    case 'DvirSubmitted':
      console.log(`Samsara DVIR submitted ${eventId} at ${occurredAt} (org ${body.orgId})`);
      break;
    default:
      console.log(`Samsara ${eventType} event ${eventId} at ${occurredAt}`);
  }
  // Samsara retries non-2xx responses: use eventId to skip duplicates.
  return { received: true, eventType: eventType ?? null, occurredAt };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/samsara', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.SAMSARA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SAMSARA_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('SAMSARA_WEBHOOK_SECRET is not valid base64: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySamsaraWebhook(rawBody, req.get('x-samsara-signature'), req.get('x-samsara-timestamp'), secret)) {
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
    console.log(`Samsara webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/samsara`);
  });
}

module.exports = { app, verifySamsaraWebhook, decodeBase64Secret, handleEvent };
