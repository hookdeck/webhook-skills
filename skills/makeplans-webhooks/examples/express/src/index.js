// Generated with: makeplans-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// MakePlans signs webhooks with X-MakePlans-Signature: "sha256=" + HMAC-SHA256
// of the request body, keyed with your Account secret (Setup > Webhooks; it is
// not the API key). MakePlans' docs show a 64-character lowercase hex example
// and no code, so hex is inferred from that example.
// ---------------------------------------------------------------------------

/**
 * Verify X-MakePlans-Signature against the exact bytes MakePlans sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-MakePlans-Signature
 * @param {string|undefined} secret - MAKEPLANS_ACCOUNT_SECRET
 * @returns {boolean}
 */
function verifyMakePlansSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Body: event, idempotency_id (dedupe on it), generated_at, performed_by and
 * data { object, id, <object type>: {...} }. The same object, id and
 * <object type> fields are repeated at the root for legacy reasons: use data.
 */
function handleEvent(event) {
  const data = event.data || {};
  switch (event.event) {
    case 'booking.created':
    case 'booking.confirmed':
    case 'booking.modified':
    case 'booking.cancelled':
    case 'booking.declined':
    case 'booking.deleted':
    case 'booking.verified':
    case 'booking.waitlisted':
    case 'booking.waitlist_promoted':
      console.log(`${event.event}: booking ${data.id}`);
      break;
    case 'person.created':
    case 'person.updated':
    case 'person.deleted':
      console.log(`${event.event}: person ${data.id}`);
      break;
    case 'event.created':
    case 'event.modified':
    case 'event.deleted':
      console.log(`${event.event}: event ${data.id}`);
      break;
    case 'message.processed':
      console.log(`Message ${data.id} processed`);
      break;
    default:
      console.log(`Unhandled MakePlans event: ${event.event}`);
  }
  return { received: true, event_type: event.event, event_id: event.idempotency_id };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/makeplans', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.MAKEPLANS_ACCOUNT_SECRET;
  if (!secret || !secret.trim()) {
    console.error('MAKEPLANS_ACCOUNT_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMakePlansSignature(rawBody, req.get('x-makeplans-signature'), secret)) {
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
    console.log(`MakePlans webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/makeplans`);
  });
}

module.exports = { app, verifyMakePlansSignature, handleEvent };
