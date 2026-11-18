// Generated with: checkr-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Checkr signs every webhook with X-Checkr-Signature: the lowercase hex
// HMAC-SHA256 of the raw request body. Checkr issues no dedicated webhook
// secret. The key is:
//   - direct accounts: the OLDEST secret API key on the account
//   - Partner apps:    the partner application's OAuth client secret
// Accounts without an API key get a placeholder sentence in the header
// instead of a signature, which never verifies.
// ---------------------------------------------------------------------------

/**
 * Verify X-Checkr-Signature against the exact bytes Checkr sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Checkr-Signature
 * @param {string|undefined} key - API key or Partner client secret, used as UTF-8 text
 * @returns {boolean}
 */
function verifyCheckrSignature(rawBody, signature, key) {
  const secret = String(key || '').trim();
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

/**
 * Every event has id, object ("event"), type, created_at, webhook_url and
 * data.object. data.object is the full object when include_object is on
 * (always on for Partner apps), otherwise just id, object and uri.
 * Checkr doesn't guarantee order: fetch the object when the order matters.
 */
function handleEvent(event) {
  const object = (event.data && event.data.object) || {};
  switch (event.type) {
    case 'report.completed':
      console.log(`Report ${object.id} completed: status=${object.status} result=${object.result}`);
      break;
    case 'report.suspended':
    case 'report.resumed':
    case 'report.canceled':
    case 'report.engaged':
      console.log(`${event.type}: report ${object.id}`);
      break;
    case 'candidate.created':
    case 'candidate.updated':
      console.log(`${event.type}: candidate ${object.id}`);
      break;
    case 'invitation.completed':
    case 'invitation.expired':
      console.log(`${event.type}: invitation ${object.id}`);
      break;
    default:
      console.log(`Unhandled Checkr event: ${event.type}`);
  }
  return { received: true, type: event.type, id: event.id };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/checkr', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const key = process.env.CHECKR_SIGNING_KEY;
  if (!key || !key.trim()) {
    console.error('CHECKR_SIGNING_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyCheckrSignature(rawBody, req.get('x-checkr-signature'), key)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Any 2xx acknowledges the delivery; Checkr ignores the response body.
  return res.status(200).json(handleEvent(event));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Checkr webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/checkr`);
  });
}

module.exports = { app, verifyCheckrSignature, handleEvent };
