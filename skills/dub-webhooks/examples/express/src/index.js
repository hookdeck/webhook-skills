require('dotenv').config({ quiet: true });
const crypto = require('node:crypto');
const express = require('express');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => value.length === 64 && /^[0-9a-fA-F]{64}$/.test(value);

// This signature covers only the body; there is no signed timestamp to check.
function verifySignature(rawBody, header, secret, toleranceSeconds = 0) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !secret) return false;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  let message = rawBody;
  let signatures;
  signatures = [header];
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return signatures.some((signature) => {
    // Check length/alphabet BEFORE Buffer.from: Node silently truncates invalid hex.
    if (!isHex(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

function getEventNames(payload) {
  return typeof payload.event === 'string' ? [payload.event] : [];
}

function handleEvent(payload) {
  for (const event of getEventNames(payload)) {
    switch (event) {
      case 'link.created':
      case 'lead.created':
      case 'sale.created':
        // Put durable, idempotent business processing here before acknowledging.
        console.log('Received Dub event:', event);
        break;
      default:
        // Unknown events are acknowledged; never dump the full payload into logs.
        console.log('Unhandled Dub event:', event);
    }
  }
}

const app = express();
app.post('/webhooks/dub', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DUB_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });
  const tolerance = 0;
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(rawBody, req.get('dub-signature'), secret, tolerance)) {
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
