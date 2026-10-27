// Generated with: breakcold-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PREFIX = /^sha256=/i;
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

/**
 * Verify a Breakcold webhook signature.
 *
 * X-Webhook-Signature = "sha256=" + hex(HMAC-SHA256(secret, `${X-Webhook-Timestamp}.${rawBody}`))
 *
 * The signed message is built as bytes: the timestamp header exactly as received
 * (latin1), a literal ".", then the raw body bytes. The body is never decoded.
 *
 * @param {Buffer} rawBody - exact request body bytes
 * @param {string|undefined} signatureHeader - X-Webhook-Signature
 * @param {string|undefined} timestampHeader - X-Webhook-Timestamp
 * @param {string|undefined} secret - BREAKCOLD_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyBreakcoldSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!signatureHeader || !timestampHeader || !secret) return false;

  // Accept the value with or without the `sha256=` prefix, then validate the
  // format (64 hex chars) BEFORE decoding: Buffer.from(x, 'hex') silently drops
  // bad characters.
  const digest = String(signatureHeader).replace(SIGNATURE_PREFIX, '');
  if (!HEX_DIGEST.test(digest)) return false;

  const signed = Buffer.concat([
    Buffer.from(String(timestampHeader), 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(digest, 'hex'); // case-insensitive; both are 32 bytes

  return crypto.timingSafeEqual(received, expected);
}

/**
 * Optional replay check. toleranceSeconds <= 0 (or NaN) disables it.
 * X-Webhook-Timestamp is Unix seconds.
 */
function isTimestampFresh(timestampHeader, toleranceSeconds, nowSeconds = Date.now() / 1000) {
  if (!(toleranceSeconds > 0)) return true;
  if (!/^\d+$/.test(String(timestampHeader))) return false;
  return Math.abs(nowSeconds - Number(timestampHeader)) <= toleranceSeconds;
}

// Deduplicate on X-Webhook-Delivery-Id ("Use it for idempotency").
// In production use Redis/Postgres with a TTL, not an in-memory Set.
const processedDeliveries = new Set();

function alreadyProcessed(deliveryId) {
  if (!deliveryId) return false;
  if (processedDeliveries.has(deliveryId)) return true;
  processedDeliveries.add(deliveryId);
  return false;
}

/** Dispatch on the body's `event` field. Runs after the 2xx response. */
function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'record.created':
      console.log(`[record.created] ${data.objectTypeName ?? data.objectType}: ${data.name} (${data.id})`);
      break;
    case 'record.updated':
      console.log(`[record.updated] ${data.name} (${data.id}) fields: ${Object.keys(data.fields ?? {}).join(', ')}`);
      break;
    case 'record.deleted':
      console.log(`[record.deleted] ${data.id}`);
      break;
    case 'note.created':
    case 'note.updated':
    case 'note.deleted':
      console.log(`[${event}] note ${data.noteId} on record ${data.recordId}: ${data.title}`);
      break;
    case 'task.created':
    case 'task.completed':
      console.log(`[${event}] task ${data.taskId} "${data.title}" on record ${data.recordId}`);
      break;
    case 'relation.added':
    case 'relation.removed':
      console.log(`[${event}] ${data.sourceRecordId} -> ${data.targetRecordId} via ${data.fieldSlug}`);
      break;
    case 'call.linked':
    case 'call.unlinked':
      console.log(`[${event}] call ${data.callId} "${data.meetingTitle}" on record ${data.recordId}`);
      break;
    case 'file.uploaded':
    case 'file.deleted':
      console.log(`[${event}] ${data.fileName} on record ${data.recordId}`);
      break;
    case 'webhook.test':
      console.log(`[webhook.test] ${data.message}`);
      break;
    default:
      console.log(`[unhandled] ${event}`);
  }
}

// express.raw with '*/*' keeps the exact bytes whatever Content-Type arrives.
// Do not mount express.json() ahead of this route.
app.post('/webhooks/breakcold', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BREAKCOLD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BREAKCOLD_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];

  // 1. VERIFY against the raw bytes, before parsing anything.
  if (!verifyBreakcoldSignature(rawBody, signature, timestamp, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Opt-in replay window (off by default; see .env.example).
  const tolerance = Number(process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS);
  if (!isTimestampFresh(timestamp, tolerance)) {
    return res.status(401).json({ error: 'Timestamp outside tolerance' });
  }

  // 2. PARSE only after verification.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // 3. DEDUPE.
  if (alreadyProcessed(req.headers['x-webhook-delivery-id'] ?? payload.eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // 4. RESPOND FAST (Breakcold times out after 10s), then process.
  res.status(200).json({ received: true });
  setImmediate(() => {
    try {
      handleEvent(payload);
    } catch (err) {
      console.error('Error handling Breakcold webhook:', err);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyBreakcoldSignature, isTimestampFresh, handleEvent };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/breakcold`);
  });
}
