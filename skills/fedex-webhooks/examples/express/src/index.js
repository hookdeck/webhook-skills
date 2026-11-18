// Generated with: fedex-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// FedEx Advanced Integrated Visibility (AIV) webhooks carry fdx-signature: the
// base64 HMAC-SHA256 of the payload, keyed with the security token you set on
// the webhook (or typed into "Try this webhook"). One sentence in FedEx's docs
// says "hex encoding", but the formula, the Java sample and the FAQ all say
// base64.
// ---------------------------------------------------------------------------

/**
 * Verify fdx-signature against the exact bytes FedEx sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - fdx-signature
 * @param {string|undefined} secret - FEDEX_WEBHOOK_SECURITY_TOKEN
 * @returns {boolean}
 */
function verifyFedExSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^([A-Za-z0-9+/]{43}=)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

/**
 * The body is tracking data for one shipment event, in the schema you can
 * download from the FedEx Developer Portal (detailed or event-specific
 * tracking response). Map the fields you need from that schema.
 */
function handleEvent(event) {
  console.log(`FedEx tracking notification with fields: ${Object.keys(event).join(', ')}`);
  return { received: true };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/fedex', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.FEDEX_WEBHOOK_SECURITY_TOKEN;
  if (!secret || !secret.trim()) {
    console.error('FEDEX_WEBHOOK_SECURITY_TOKEN is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyFedExSignature(rawBody, req.get('fdx-signature'), secret)) {
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
    console.log(`FedEx webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fedex`);
  });
}

module.exports = { app, verifyFedExSignature, handleEvent };
