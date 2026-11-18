// Generated with: close-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Close (close.com) signs each webhook with two headers:
//   close-sig-timestamp: <unix seconds>
//   close-sig-hash: <hex HMAC-SHA256 of timestamp + raw body, no delimiter>
// The subscription's signature_key is HEX: decode it to get the HMAC key.
// (Decoding it as base64 also "works" and gives 48 wrong bytes.)
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
 * @param {Buffer|string} rawBody - the exact bytes Close sent
 * @param {string|undefined} sigHash - close-sig-hash (hex)
 * @param {string|undefined} timestamp - close-sig-timestamp
 * @param {string|undefined} signatureKey - CLOSE_WEBHOOK_SIGNATURE_KEY (hex, as returned)
 * @returns {boolean}
 */
function verifyCloseWebhook(rawBody, sigHash, timestamp, signatureKey) {
  const key = decodeHexSecret(signatureKey);
  const given = String(sigHash || '').trim();
  if (!key || !timestamp || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  // The timestamp and the body are concatenated with no delimiter.
  const expected = crypto.createHmac('sha256', key).update(timestamp, 'utf8').update(rawBody).digest();
  return bytesEqual(Buffer.from(given, 'hex'), expected);
}

/**
 * Close posts { subscription_id, event }. The event has id, object_type,
 * action, object_id, lead_id, changed_fields, data and previous_data.
 */
function handleEvent(payload) {
  const event = (payload && payload.event) || {};
  const name = `${event.object_type}.${event.action}`;
  switch (name) {
    case 'lead.created':
      console.log(`Close lead created: ${event.object_id}`);
      break;
    case 'opportunity.updated':
      console.log(`Close opportunity ${event.object_id} changed: ${(event.changed_fields || []).join(', ')}`);
      break;
    default:
      console.log(`Close ${name} event ${event.id}`);
  }
  // Close retries for up to 72 hours: use event.id to skip duplicates.
  return { received: true, event: name };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/close', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.CLOSE_WEBHOOK_SIGNATURE_KEY;
  if (!secret) {
    console.error('CLOSE_WEBHOOK_SIGNATURE_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeHexSecret(secret)) {
    console.error('CLOSE_WEBHOOK_SIGNATURE_KEY is not valid hex: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid hex' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyCloseWebhook(rawBody, req.get('close-sig-hash'), req.get('close-sig-timestamp'), secret)) {
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
    console.log(`Close webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/close`);
  });
}

module.exports = { app, verifyCloseWebhook, decodeHexSecret, handleEvent };
