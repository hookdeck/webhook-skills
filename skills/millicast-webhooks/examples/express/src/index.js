// Generated with: millicast-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Millicast (Dolby OptiView Real-time Streaming) signs each webhook with:
//   x-millicast-signature: sha1=<hex HMAC-SHA1 of the raw body>
// The body is JSON for most hooks and a JPEG for thumbnail hooks; both are
// signed as raw bytes. The Webhook Secret is base64: decode it to get the key.
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
 * @param {Buffer} rawBody - the exact bytes Millicast sent (JSON or JPEG)
 * @param {string|undefined} signature - x-millicast-signature ("sha1=<hex>")
 * @param {string|undefined} secret - MILLICAST_WEBHOOK_SECRET (base64, as shown)
 * @returns {boolean}
 */
function verifyMillicastWebhook(rawBody, signature, secret) {
  const key = decodeBase64Secret(secret);
  if (!key || !signature) return false;
  const match = /^sha1=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha1', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * JSON hooks share one envelope: type ("feeds", "recordings", "media",
 * "transcoder" or "viewerConnection"), event ("started", "ended", ...),
 * timestamp (epoch ms) and data, which depends on the type.
 */
function handleEvent(payload) {
  const { type, event, data } = payload && typeof payload === 'object' ? payload : {};
  switch (type) {
    case 'feeds':
      // data: feedId, accountId, name, streamId, active, and started or ended
      console.log(`Millicast stream ${data && data.name} ${event}`);
      break;
    case 'recordings':
    case 'media':
      console.log(`Millicast media ${event}`);
      break;
    case 'transcoder':
      console.log(`Millicast transcoder ${event}`);
      break;
    case 'viewerConnection':
      console.log(`Millicast viewer connection ${event}`);
      break;
    default:
      console.log(`Millicast ${type} ${event}`);
  }
  // Events arrive asynchronously, so order isn't guaranteed.
  return { received: true, type: type ?? null, event: event ?? null };
}

/** Thumbnail hooks: the body is the JPEG; stream details come in x-millicast-* headers. */
function handleThumbnail(jpeg, streamId) {
  console.log(`Millicast thumbnail for stream ${streamId}: ${jpeg.length} bytes`);
  return { received: true, type: 'thumbnail', bytes: jpeg.length };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/millicast', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const secret = process.env.MILLICAST_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MILLICAST_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('MILLICAST_WEBHOOK_SECRET is not valid base64: check the value you configured');
    return res.status(500).json({ error: 'Webhook secret is not valid base64' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMillicastWebhook(rawBody, req.get('x-millicast-signature'), secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Thumbnail hooks send the captured JPEG (Content-Type image/jpeg), signed the same way.
  if (/^image\//i.test(req.get('content-type') || '')) {
    return res.status(200).json(handleThumbnail(rawBody, req.get('x-millicast-stream-id')));
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  return res.status(200).json(handleEvent(payload));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dolby OptiView Real-time (Millicast) webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/millicast`);
  });
}

module.exports = { app, verifyMillicastWebhook, decodeBase64Secret, handleEvent, handleThumbnail };
