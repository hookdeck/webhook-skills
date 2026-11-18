// Generated with: mindbody-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Mindbody delivers events as POSTs with X-Mindbody-Signature:
//   "sha256=" + base64(HMAC-SHA256(raw body))
// keyed with the subscription's messageSignatureKey used as UTF-8 text. The key
// looks like base64, but Mindbody's sample does not decode it.
// Mindbody also sends a HEAD request to the webhook URL when a subscription is
// created (and, per its error table, when one is changed with PATCH). The URL must
// answer with a 2xx, or the API call fails with invalidWebhookURLNoResponse.
// ---------------------------------------------------------------------------

/**
 * Verify X-Mindbody-Signature against the exact bytes Mindbody sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Mindbody-Signature
 * @param {string|undefined} secret - MINDBODY_MESSAGE_SIGNATURE_KEY
 * @returns {boolean}
 */
function verifyMindbodySignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 44 base64 characters with one '='.
  const match = /^sha256=([A-Za-z0-9+/]{43}=)$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'base64'), expected);
}

/**
 * Every event has the same envelope: messageId (dedupe on it), eventId (the
 * event type), eventSchemaVersion, eventInstanceOriginationDateTime and
 * eventData, whose shape depends on eventId.
 */
function handleEvent(event) {
  const data = event.eventData || {};
  switch (event.eventId) {
    case 'appointmentBooking.created':
    case 'appointmentBooking.updated':
    case 'appointmentBooking.cancelled':
      console.log(`${event.eventId}: appointment ${data.appointmentId} at site ${data.siteId}`);
      break;
    case 'classRosterBooking.created':
    case 'classRosterBooking.cancelled':
      console.log(`${event.eventId}: client ${data.clientId} in class ${data.classId} at site ${data.siteId}`);
      break;
    case 'client.created':
    case 'client.updated':
      console.log(`${event.eventId}: client ${data.clientId} at site ${data.siteId}`);
      break;
    case 'clientSale.created':
      console.log(`Sale ${data.saleId} at site ${data.siteId}`);
      break;
    default:
      console.log(`Unhandled Mindbody event: ${event.eventId}`);
  }
  return { received: true, event_type: event.eventId, event_id: event.messageId };
}

// Mindbody checks the URL with a HEAD request. It carries no body or
// signature: answer 200 and do nothing else.
app.head('/webhooks/mindbody', (req, res) => {
  res.status(200).end();
});

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/mindbody', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.MINDBODY_MESSAGE_SIGNATURE_KEY;
  if (!secret || !secret.trim()) {
    console.error('MINDBODY_MESSAGE_SIGNATURE_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMindbodySignature(rawBody, req.get('x-mindbody-signature'), secret)) {
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
    console.log(`Mindbody webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mindbody`);
  });
}

module.exports = { app, verifyMindbodySignature, handleEvent };
