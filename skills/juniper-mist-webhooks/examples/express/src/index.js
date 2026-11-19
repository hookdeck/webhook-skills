// Generated with: juniper-mist-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Juniper Mist signs http-post webhooks that have a Secret set with two headers:
//   X-Mist-Signature-v2  lowercase hex HMAC-SHA256(secret, raw body)
//   X-Mist-Signature     lowercase hex HMAC-SHA1(secret, raw body)  (legacy v1)
// This example verifies v2 only. Webhooks without a secret, and the OAuth2 and
// Splunk webhook types, carry no signature.
// ---------------------------------------------------------------------------

/**
 * Verify X-Mist-Signature-v2 against the exact bytes Juniper Mist sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Mist-Signature-v2
 * @param {string|undefined} secret - MIST_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyMistSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^([0-9a-fA-F]{64})$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Every delivery is { topic, events: [...] }. One POST can carry several
 * events of the same topic. The event fields depend on the topic.
 */
function handleEvent(body) {
  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    switch (body.topic) {
      case 'alarms':
        console.log(`Alarm ${event.type} (${event.severity}) at site ${event.site_id}`);
        break;
      case 'audits':
        console.log(`Audit: ${event.message} by ${event.admin_name}`);
        break;
      case 'device-events':
      case 'device-updowns':
        console.log(`${body.topic}: ${event.type} on ${event.device_name || event.mac}`);
        break;
      default:
        console.log(`Mist ${body.topic} event`);
    }
  }
  return { received: true, topic: body.topic, events: events.length };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/juniper-mist', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.MIST_WEBHOOK_SECRET;
  if (!secret || !secret.trim()) {
    console.error('MIST_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMistSignature(rawBody, req.get('x-mist-signature-v2'), secret)) {
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
    console.log(`Juniper Mist webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/juniper-mist`);
  });
}

module.exports = { app, verifyMistSignature, handleEvent };
