// Generated with: podium-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Podium signs every delivery (only when the webhook was created with a secret):
//   podium-signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   podium-timestamp  Unix MILLISECONDS when the payload was signed
// Signed content: `${podium-timestamp header}.${raw request body}`
// Key: the `secret` set when the webhook was created, as UTF-8 bytes, not decoded.
// ---------------------------------------------------------------------------

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Podium delivery. The signed message is built as bytes: the
 * timestamp header as latin1, a literal ".", then the raw body bytes exactly as
 * received. The body is never parsed or re-serialised.
 *
 * @param {Buffer} rawBody - the exact bytes Podium sent (empty Buffer if none)
 * @param {string|undefined} signature - podium-signature value
 * @param {string|undefined} timestamp - podium-timestamp value
 * @param {string|undefined} secret - the `secret` set when the webhook was created
 * @returns {boolean}
 */
function verifyPodiumSignature(rawBody, signature, timestamp, secret) {
  if (!secret || !signature || !timestamp) return false;
  // Validate length and alphabet BEFORE decoding: Buffer.from(x, 'hex')
  // silently drops bad characters.
  if (!HEX_DIGEST.test(signature)) return false;

  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signed)
    .digest();
  const received = Buffer.from(signature, 'hex'); // hex is case-insensitive
  return crypto.timingSafeEqual(expected, received); // both are 32 bytes
}

/**
 * Opt-in replay window in seconds. Unset or 0 = off (Hookdeck retries keep the
 * original timestamp). podium-timestamp is Unix milliseconds.
 */
function withinTolerance(timestamp) {
  const tolerance = Number(process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!(tolerance > 0)) return true;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(Date.now() - ts) <= tolerance * 1000;
}

// Podium delivers { data, metadata: { event_type, version } }. Dispatch on
// metadata.event_type; the full list (26 events) is in the Podium docs.
function handleEvent(payload) {
  const eventType = payload.metadata?.event_type;
  const data = payload.data;

  switch (eventType) {
    case 'message.received':
      console.log('Message received', data);
      break;
    case 'message.sent':
      console.log('Message sent', data);
      break;
    case 'contact.created':
      console.log('Contact created', data);
      break;
    case 'contact.updated':
      console.log('Contact updated', data);
      break;
    case 'review.created':
      console.log('Review created', data);
      break;
    case 'invoice.payment_succeeded':
      console.log('Invoice payment succeeded', data);
      break;
    case 'call.completed':
      console.log('Call completed', data);
      break;
    default:
      console.log(`Unhandled Podium event: ${eventType}`);
  }
}

// Podium doesn't document the HTTP method, so accept any of them. The raw
// parser takes every content type so the exact bytes reach the HMAC.
app.all('/webhooks/podium', express.raw({ type: '*/*' }), (req, res) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.PODIUM_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('PODIUM_WEBHOOK_SECRET is not set - rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // No body (e.g. GET) leaves req.body unset: treat it as empty bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('podium-signature');
  const timestamp = req.get('podium-timestamp');

  if (!verifyPodiumSignature(rawBody, signature, timestamp, secret)) {
    console.error('Podium signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!withinTolerance(timestamp)) {
    return res.status(401).json({ error: 'Timestamp outside tolerance' });
  }

  // Parse only after the signature is verified.
  let payload = {};
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  try {
    // Keep this fast. In production, enqueue and process asynchronously, and
    // make handling idempotent (no delivery id header is documented; use the object ids in `data`).
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Podium event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Podium webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/podium`);
  });
}

module.exports = { app, server, verifyPodiumSignature };
