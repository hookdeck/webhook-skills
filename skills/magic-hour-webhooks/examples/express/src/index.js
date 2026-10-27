// Generated with: magic-hour-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Magic Hour webhook.
 *
 * signature = lowercase hex HMAC-SHA256(secret, `${timestamp header}.${raw body}`)
 * This is NOT Standard Webhooks: the key is the secret's UTF-8 bytes (whsec_ prefix kept,
 * nothing decoded) and the digest is hex.
 *
 * @param {Buffer} rawBody exact bytes received
 * @param {object} headers Node request headers (lowercased names)
 * @param {object} config  { secret, toleranceSeconds } (toleranceSeconds 0/unset = off)
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyMagicHourSignature(rawBody, headers, config = {}) {
  const secret =
    config.secret !== undefined ? config.secret : process.env.MAGIC_HOUR_WEBHOOK_SECRET;
  const toleranceSeconds =
    config.toleranceSeconds !== undefined
      ? config.toleranceSeconds
      : Number(process.env.MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!secret) return { valid: false, error: 'Webhook secret not configured' };

  const signature = headers['magic-hour-event-signature'];
  const timestamp = headers['magic-hour-event-timestamp'];
  if (typeof signature !== 'string' || signature === '') {
    return { valid: false, error: 'Missing magic-hour-event-signature header' };
  }
  if (typeof timestamp !== 'string' || timestamp === '') {
    return { valid: false, error: 'Missing magic-hour-event-timestamp header' };
  }

  // Check the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_64.test(signature)) {
    return { valid: false, error: 'Malformed signature (expected 64 hex characters)' };
  }

  // Signed message as bytes: header (latin1, untouched) + "." + the raw body bytes.
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message)
    .digest();
  const received = Buffer.from(signature, 'hex');

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}

/**
 * Dispatch on the body's `type`. The payload matches GET /v1/{video,image,audio}-projects/:id.
 * Payloads carry no event ID: dedupe on `${payload.id}:${type}`.
 */
function handleEvent(event) {
  const { type } = event;
  const payload = event.payload ?? {};

  switch (type) {
    case 'video.started':
    case 'image.started':
    case 'audio.started':
      console.log(`${type}: job ${payload.id} is rendering`);
      break;

    case 'video.completed':
    case 'image.completed':
    case 'audio.completed':
      console.log(`${type}: job ${payload.id} complete`);
      // Download URLs expire: save the files from payload.downloads[].url promptly
      for (const download of Array.isArray(payload.downloads) ? payload.downloads : []) {
        console.log(`  download: ${download?.url} (expires ${download?.expires_at})`);
      }
      break;

    case 'video.errored':
    case 'image.errored':
    case 'audio.errored':
      console.log(
        `${type}: job ${payload.id} failed: ${payload.error && payload.error.code} ` +
          `${payload.error && payload.error.message}`
      );
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

// Read the raw bytes for any content type; parse only after verification.
app.post('/webhooks/magic-hour', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const result = verifyMagicHourSignature(rawBody, req.headers);
  if (!result.valid) {
    console.error(`Magic Hour webhook rejected: ${result.error}`);
    return res.status(401).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Expected an object with a string "type"' });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Magic Hour event:', err);
    // A non-2xx makes Magic Hour retry (1, 2, 4, ... minutes, up to 24 hours).
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMagicHourSignature = verifyMagicHourSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/magic-hour`);
  });
}
