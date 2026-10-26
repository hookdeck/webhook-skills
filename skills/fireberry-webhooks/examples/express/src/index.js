// Generated with: fireberry-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The automation's author picks the HTTP method, so accept all five Fireberry offers.
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']);

/**
 * Constant-time string comparison. Lengths are checked first because timingSafeEqual
 * throws on unequal lengths; both sides are compared as equal-length Buffers.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Fireberry does not sign requests. The webhook automation action sends whatever
 * Header key/value pairs you configured, so the header name is user-chosen. Compare
 * the WHOLE value (do not strip a "Bearer " prefix). A static shared credential
 * authenticates the sender, not the body, and offers no replay protection.
 */
function verifyFireberryRequest(
  headers,
  secret = process.env.FIREBERRY_WEBHOOK_SECRET,
  headerName = process.env.FIREBERRY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// Fireberry adds no event field: the body is free text written by the automation's author.
// This handler assumes an illustrative JSON body such as
//   {"event": "account.created", "record": {"accountname": "Acme"}}
function handleEvent(payload) {
  const { event, record } = payload;

  switch (event) {
    case 'account.created':
      console.log(`Account created: ${record && record.accountname}`);
      // TODO: sync the new account to your system
      break;

    case 'record.updated':
      console.log(`Record updated: ${record && record.id}`);
      // TODO: apply the changed fields
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/fireberry', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.has(req.method)) {
    res.set('Allow', [...METHODS].join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyFireberryRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  // GET (and sometimes DELETE) requests have no body: acknowledge them.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    console.log(`${req.method} webhook with empty body`);
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Fireberry webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFireberryRequest = verifyFireberryRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/fireberry`);
  });
}
