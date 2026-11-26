// Generated with: bill-com-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// BILL signs every event notification with x-bill-sha-signature: the base64
// HMAC-SHA256 of the body, keyed with the subscription's securityKey as text.
// BILL's guide checks it against the "unformatted (minified)" JSON because its
// example reads the body from a viewer that pretty-prints it. BILL sends the body
// compact, so HMAC the raw bytes exactly as received and never re-serialise.
// ---------------------------------------------------------------------------

/**
 * Verify X-Bill-Sha-Signature against the exact bytes BILL sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Bill-Sha-Signature
 * @param {string|undefined} secret - BILL_WEBHOOK_SECURITY_KEY
 * @returns {boolean}
 */
function verifyBillSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^([A-Za-z0-9+/]{43}=)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

/**
 * Body: { metadata: { eventId, subscriptionId, organizationId, eventType,
 * version }, payload: {...} }. The payload depends on eventType. Dedupe on
 * metadata.eventId: notifications can repeat and arrive out of order.
 */
function handleEvent(event) {
  const metadata = event.metadata || {};
  switch (metadata.eventType) {
    case 'test':
      console.log(`BILL test notification for subscription ${metadata.subscriptionId}`);
      break;
    case 'bill.created':
    case 'bill.updated':
    case 'bill.archived':
      console.log(`${metadata.eventType} in organization ${metadata.organizationId}`);
      break;
    default:
      console.log(`BILL event ${metadata.eventType} (version ${metadata.version})`);
  }
  return { received: true, event_type: metadata.eventType, event_id: metadata.eventId };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/bill-com', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.BILL_WEBHOOK_SECURITY_KEY;
  if (!secret || !secret.trim()) {
    console.error('BILL_WEBHOOK_SECURITY_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBillSignature(rawBody, req.get('x-bill-sha-signature'), secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  return res.status(200).json(handleEvent(event));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BILL webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bill-com`);
  });
}

module.exports = { app, verifyBillSignature, handleEvent };
