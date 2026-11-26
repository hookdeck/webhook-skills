// Generated with: authorize-net-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Authorize.net signs webhooks with X-ANET-Signature: "sha512=" followed by the
// uppercase hex HMAC-SHA512 of the raw body, keyed with your Signature Key used
// as text (the 128-character string itself, not hex-decoded). Hex is compared
// case-insensitively, and the "sha512=" prefix is matched in either case.
// ---------------------------------------------------------------------------

/**
 * Verify X-ANET-Signature against the exact bytes Authorize.net sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-ANET-Signature
 * @param {string|undefined} secret - AUTHORIZE_NET_SIGNATURE_KEY
 * @returns {boolean}
 */
function verifyAuthorizeNetSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-512 is 64 bytes: 128 hex characters.
  const match = /^sha512=([0-9a-fA-F]{128})$/i.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Body: { notificationId, eventType, eventDate, webhookId, payload }. payload
 * is a summary (entityName + id), not the full record: fetch the transaction or
 * profile from the API if you need more. Dedupe on notificationId.
 */
function handleEvent(event) {
  const payload = event.payload || {};
  if (String(event.eventType || '').startsWith('net.authorize.payment.')) {
    console.log(`Transaction ${payload.id}: ${event.eventType} (responseCode ${payload.responseCode}, ${payload.authAmount})`);
  } else if (String(event.eventType || '').startsWith('net.authorize.customer.')) {
    console.log(`${payload.entityName} ${payload.id}: ${event.eventType}`);
  } else {
    console.log(`Authorize.net event ${event.eventType}`);
  }
  return { received: true, event_type: event.eventType, event_id: event.notificationId };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/authorize-net', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.AUTHORIZE_NET_SIGNATURE_KEY;
  if (!secret || !secret.trim()) {
    console.error('AUTHORIZE_NET_SIGNATURE_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyAuthorizeNetSignature(rawBody, req.get('x-anet-signature'), secret)) {
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
    console.log(`Authorize.net webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/authorize-net`);
  });
}

module.exports = { app, verifyAuthorizeNetSignature, handleEvent };
