// Generated with: kontent-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Kontent.ai signs webhooks with X-Kontent-ai-Signature: the base64 HMAC-SHA256
// of the raw body, keyed with the webhook's Secret used as text (it looks like
// base64, but don't decode it). Hash the bytes exactly as received: rewriting
// line endings breaks the signature.
// ---------------------------------------------------------------------------

/**
 * Verify X-Kontent-ai-Signature against the exact bytes Kontent.ai sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Kontent-ai-Signature
 * @param {string|undefined} secret - KONTENT_AI_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyKontentAiSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^([A-Za-z0-9+/]{43}=)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

/**
 * Body: { notifications: [{ data: { system }, message }] }. Each notification
 * names one changed object (data.system: id, codename, last_modified, ...) and
 * the event (message: object_type, action, delivery_slot). Notifications can
 * arrive in batches. Fetch fresh content from the Delivery API if you need it.
 */
function handleEvent(event) {
  const notifications = Array.isArray(event.notifications) ? event.notifications : [];
  for (const notification of notifications) {
    const system = (notification.data && notification.data.system) || {};
    const message = notification.message || {};
    console.log(`${message.object_type} ${system.codename}: ${message.action} (${message.delivery_slot})`);
  }
  return { received: true, notifications: notifications.length };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/kontent-ai', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.KONTENT_AI_WEBHOOK_SECRET;
  if (!secret || !secret.trim()) {
    console.error('KONTENT_AI_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyKontentAiSignature(rawBody, req.get('x-kontent-ai-signature'), secret)) {
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
    console.log(`Kontent.ai webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/kontent-ai`);
  });
}

module.exports = { app, verifyKontentAiSignature, handleEvent };
