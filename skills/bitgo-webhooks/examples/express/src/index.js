// Generated with: bitgo-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// BitGo signs notifications with X-Signature-SHA256 once the enterprise (or
// organization) has a webhook secret from POST /api/v2/webhook/secret. The value
// is 64 lowercase hex characters. BitGo documents verifying it only through its
// API (POST /api/v2/webhook/{webhookId}/verify); this local check, a hex
// HMAC-SHA256 of the raw body keyed with the secret as text, is inferred.
// ---------------------------------------------------------------------------

/**
 * Verify X-Signature-SHA256 against the exact bytes BitGo sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Signature-SHA256
 * @param {string|undefined} secret - BITGO_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyBitGoSignature(rawBody, signature, secret) {
  const key = String(secret || '').trim();
  // SHA-256 is 32 bytes: 64 hex characters.
  const match = /^([0-9a-fA-F]{64})$/.exec(String(signature || '').trim());
  if (!key || !match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * The body names the webhook type and the wallet or enterprise it belongs to.
 * BitGo recommends fetching the transfer (or block) from its API before you act
 * on a notification, rather than trusting the body alone.
 */
function handleEvent(event) {
  switch (event.type) {
    case 'transfer':
      console.log(`Transfer ${event.transfer} on wallet ${event.wallet} (${event.coin}): ${event.state}`);
      break;
    case 'pendingapproval':
      console.log(`Pending approval on wallet ${event.wallet}`);
      break;
    case 'txRequest':
    case 'txRequestTransaction':
      console.log(`${event.type} update on wallet ${event.wallet}`);
      break;
    default:
      console.log(`Unhandled BitGo webhook type: ${event.type}`);
  }
  return { received: true, type: event.type, wallet: event.wallet };
}

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/bitgo', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secret = process.env.BITGO_WEBHOOK_SECRET;
  if (!secret || !secret.trim()) {
    console.error('BITGO_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBitGoSignature(rawBody, req.get('x-signature-sha256'), secret)) {
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
    console.log(`BitGo webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bitgo`);
  });
}

module.exports = { app, verifyBitGoSignature, handleEvent };
