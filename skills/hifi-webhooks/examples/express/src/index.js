require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const express = require('express');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => value.length === 64 && /^[0-9a-fA-F]{64}$/.test(value);

// A positive tolerance is an application policy. Zero leaves replay age unchecked.
function verifySignature(rawBody, header, secret, toleranceSeconds = 0) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !secret) return false;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  let message = rawBody;
  let signatures;
  const parts = header.split(',').map((part) => part.trim());
  const timestamps = parts.filter((part) => part.startsWith('t=')).map((part) => part.slice(2));
  if (timestamps.length !== 1 || !/^[0-9]+$/.test(timestamps[0])) return false;
  const timestamp = timestamps[0]; // Preserve the signed text; do not reformat it.
  if (toleranceSeconds > 0 && (!Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds)) return false;
  message = Buffer.concat([Buffer.from(timestamp + '.', 'utf8'), rawBody]);
  signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return signatures.some((signature) => {
    // Check length/alphabet BEFORE Buffer.from: Node silently truncates invalid hex.
    if (!isHex(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

function getEventNames(payload) {
  return typeof payload.eventType === 'string' ? [payload.eventType] : [];
}

function handleEvent(payload) {
  for (const event of getEventNames(payload)) {
    switch (event) {
      case 'ONRAMP.STATUS.COMPLETED':
      case 'USER.CREATED':
      case 'CRYPTO_TRANSFER.CREATED':
        // Put durable, idempotent business processing here before acknowledging.
        console.log('Received HIFI event:', event);
        break;
      default:
        // Unknown events are acknowledged; never dump the full payload into logs.
        console.log('Unhandled HIFI event:', event);
    }
  }
}

const app = express();
app.post('/webhooks/hifi', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HIFI_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });
  const tolerance = Number(process.env.HIFI_WEBHOOK_TOLERANCE_SECONDS || '0');
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return res.status(500).json({ error: 'Invalid tolerance configuration' });
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(rawBody, req.get('hifi-signature'), secret, tolerance)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  if (!isObject(payload)) return res.status(400).json({ error: 'Expected a JSON object' });
  handleEvent(payload);
  return res.status(200).json({ received: true });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
if (require.main === module) app.listen(process.env.PORT || 3000);
module.exports = { app, verifySignature, getEventNames };
