// Generated with: bugsmash-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// BugSmash signs every delivery:
//   X-BugSmash-Signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   X-Webhook-Timestamp   Unix seconds when the payload was signed
// Signed content: `${X-Webhook-Timestamp}.${raw request body}`
// Key: the secret_key as UTF-8 bytes, whole (including "bgsmsh_"), not decoded.
// ---------------------------------------------------------------------------

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a BugSmash delivery. The signed message is built as bytes: the
 * timestamp header as latin1, a literal ".", then the raw body bytes exactly as
 * received. The body is never parsed or re-serialised.
 *
 * @param {Buffer} rawBody - the exact bytes BugSmash sent (empty Buffer if none)
 * @param {string|undefined} signature - X-BugSmash-Signature value
 * @param {string|undefined} timestamp - X-Webhook-Timestamp value
 * @param {string|undefined} secret - the webhook secret_key ("bgsmsh_...")
 * @returns {boolean}
 */
function verifyBugsmashSignature(rawBody, signature, timestamp, secret) {
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

/** Opt-in replay window. Unset or 0 = off (Hookdeck retries keep the original timestamp). */
function withinTolerance(timestamp) {
  const tolerance = Number(process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!(tolerance > 0)) return true;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - ts) <= tolerance;
}

// BugSmash's docs list these events but document no delivery body, so the field
// carrying the event name is unknown. This reads `event`, then `type`, from an
// ILLUSTRATIVE payload ({ "event": "new_comment", "data": {...} }). Check a real
// delivery (POST /webhook/test) and adjust.
function handleEvent(payload) {
  const eventType = payload.event ?? payload.type;

  switch (eventType) {
    case 'new_comment':
      console.log('New comment', payload.data ?? payload);
      break;
    case 'comment_replied':
      console.log('Comment replied', payload.data ?? payload);
      break;
    case 'status_changed':
      console.log('Status changed', payload.data ?? payload);
      break;
    case 'comment_updated':
      console.log('Comment updated', payload.data ?? payload);
      break;
    default:
      console.log(`Unhandled BugSmash event: ${eventType}`);
  }
}

// BugSmash doesn't document the HTTP method, so accept any of them. The raw
// parser takes every content type so the exact bytes reach the HMAC.
app.all('/webhooks/bugsmash', express.raw({ type: '*/*' }), (req, res) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.BUGSMASH_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('BUGSMASH_WEBHOOK_SECRET is not set - rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // No body (e.g. GET) leaves req.body unset: treat it as empty bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('x-bugsmash-signature');
  const timestamp = req.get('x-webhook-timestamp');

  if (!verifyBugsmashSignature(rawBody, signature, timestamp, secret)) {
    console.error('BugSmash signature verification failed');
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
    // make handling idempotent (no delivery id header is documented).
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling BugSmash event:', err);
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
    console.log(`BugSmash webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/bugsmash`);
  });
}

module.exports = { app, server, verifyBugsmashSignature };
