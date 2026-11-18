// Generated with: monnify-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Monnify signs webhooks with monnify-signature: the lowercase hex HMAC-SHA512
// of the raw (compact JSON) body, keyed with your client secret key as text.
// Monnify's docs describe it loosely as "SHA-512(client secret key + object of
// request body)", but its code samples and published test vector use HMAC.
// Monnify's sandbox sends no monnify-signature header at all.
// ---------------------------------------------------------------------------

/**
 * Verify monnify-signature against the exact bytes Monnify sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - monnify-signature
 * @param {string|undefined} secret - MONNIFY_CLIENT_SECRET
 * @returns {boolean}
 */
function verifyMonnifySignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-512 is 64 bytes: 128 hex characters.
  const match = /^([0-9a-fA-F]{128})$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Body: { eventType, eventData }. eventData depends on eventType. For
 * transactions, confirm paymentStatus and amountPaid (or query the transaction
 * from the API) before you fulfil, and dedupe on transactionReference.
 */
function handleEvent(event) {
  const data = event.eventData || {};
  switch (event.eventType) {
    case 'SUCCESSFUL_TRANSACTION':
      console.log(`Payment ${data.transactionReference}: ${data.paymentStatus} ${data.amountPaid} ${data.currency}`);
      break;
    case 'SUCCESSFUL_REFUND':
    case 'FAILED_REFUND':
      console.log(`${event.eventType} for ${data.transactionReference}`);
      break;
    default:
      console.log(`Monnify event ${event.eventType}`);
  }
  return { received: true, event_type: event.eventType, reference: data.transactionReference };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/monnify', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.MONNIFY_CLIENT_SECRET;
  if (!secret || !secret.trim()) {
    console.error('MONNIFY_CLIENT_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMonnifySignature(rawBody, req.get('monnify-signature'), secret)) {
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
    console.log(`Monnify webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/monnify`);
  });
}

module.exports = { app, verifyMonnifySignature, handleEvent };
