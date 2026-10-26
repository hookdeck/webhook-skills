// Generated with: referralhero-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// X-ReferralHero-Signature is the bare, padded, standard-base64 HMAC-SHA256 of the raw body:
// 32 bytes -> 44 characters, 43 of [A-Za-z0-9+/] then "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a ReferralHero delivery.
 * @param {Buffer} rawBody exact request bytes (never re-serialised JSON)
 * @param {string|undefined} signature X-ReferralHero-Signature header value
 * @param {string|undefined} secret Webhook Secret Key (used as UTF-8 bytes)
 */
function verifyReferralHeroSignature(rawBody, signature, secret) {
  if (!signature || !secret || !Buffer.isBuffer(rawBody)) return false;
  // Validate the format first. Never Buffer.from(sig, 'base64'): it silently drops bad characters.
  if (!SIGNATURE_FORMAT.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  // Compare the base64 text exactly (case-sensitive), as Hookdeck does.
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Dispatch on the body's `response` field.
function handleEvent(event) {
  switch (event.response) {
    case 'new_registration':
      console.log('New subscriber registered');
      break;
    case 'subscriber_promoted':
      console.log('Subscriber promoted');
      break;
    case 'subscriber_updated':
    case 'subscriber_fields_updated': // what the docs' subscriber_updated example sends
      console.log('Subscriber fields updated');
      break;
    case 'subscriber_deleted':
      console.log('Subscriber deleted');
      break;
    case 'reward_unlocked':
      console.log('Reward unlocked');
      break;
    case 'reward_sent':
      console.log('Reward sent');
      break;
    default:
      console.log(`Unhandled ReferralHero event: ${event.response}`);
  }
}

// express.raw({ type: '*/*' }) keeps the exact bytes whatever Content-Type is sent.
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/referralhero', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.REFERRALHERO_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('REFERRALHERO_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-referralhero-signature');
  if (!verifyReferralHeroSignature(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
  } catch (err) {
    console.error('Error handling ReferralHero event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // ReferralHero wants 200 with a blank body; anything else counts as an error.
  return res.status(200).end();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`ReferralHero webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/referralhero`);
  });
}

module.exports = { app, server, verifyReferralHeroSignature };
