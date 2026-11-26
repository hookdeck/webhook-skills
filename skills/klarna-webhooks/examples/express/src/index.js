// Generated with: klarna-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Klarna Notifications API webhooks carry Klarna-Signature: the lowercase hex
// HMAC-SHA256 of the raw body, keyed with the signing key (the signing_key that
// createSigningKey returned) as UTF-8 text. Klarna-Signing-Key-Id names the key.
// ---------------------------------------------------------------------------

/**
 * Verify Klarna-Signature against the exact bytes Klarna sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - Klarna-Signature
 * @param {string|undefined} secret - KLARNA_SIGNING_KEY
 * @returns {boolean}
 */
function verifyKlarnaSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^([0-9a-fA-F]{64})$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Body: { metadata: { event_id, event_type, event_version, occurred_at,
 * webhook_id, live, ... }, payload: {...} }. Klarna asks you to store the event
 * keyed on metadata.event_id, acknowledge with a 2xx, then do the work
 * asynchronously. A repeated event_id is a retry: acknowledge and discard it.
 */
function handleEvent(event) {
  const metadata = event.metadata || {};
  const type = metadata.event_type || '';
  if (type.startsWith('payment.request.state-change.')) {
    console.log(`Payment request ${(event.payload || {}).payment_request_id}: ${type.split('.').pop()}`);
  } else if (type.startsWith('payment.transaction.')) {
    console.log(`Payment transaction event: ${type}`);
  } else {
    console.log(`Klarna event ${type} (${metadata.event_version})`);
  }
  return { received: true, event_type: metadata.event_type, event_id: metadata.event_id };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/klarna', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.KLARNA_SIGNING_KEY;
  if (!secret || !secret.trim()) {
    console.error('KLARNA_SIGNING_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyKlarnaSignature(rawBody, req.get('klarna-signature'), secret)) {
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
    console.log(`Klarna webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/klarna`);
  });
}

module.exports = { app, verifyKlarnaSignature, handleEvent };
