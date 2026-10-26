// Generated with: rebilly-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Strict base64 alphabet: anything after the credentials (spaces, "!", extra "=") fails the match.
const BASIC_RE = /^basic +([A-Za-z0-9+/]+={0,2})$/i;
const COLON = 0x3a;

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Parse "Authorization: Basic base64(username:password)"; null when missing or malformed. */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = BASIC_RE.exec(header);
  if (!match || match[1].length % 4 !== 0) return null;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return null; // non-canonical encoding
  const colon = decoded.indexOf(COLON); // split on the FIRST colon: passwords may contain ":"
  if (colon === -1) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Rebilly sends HTTP basic auth with every webhook when the webhook has credentials. There is
 * no signature check here: a static credential authenticates the sender, not the body, and
 * gives no replay protection.
 */
function verifyRebillyRequest(
  headers,
  username = process.env.REBILLY_WEBHOOK_USERNAME,
  password = process.env.REBILLY_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}

function handleEvent(payload) {
  const { eventType } = payload;

  switch (eventType) {
    case 'transaction-processed':
      console.log(`Transaction processed`);
      // TODO: fulfil the order, inspect payload._embedded.transaction
      break;

    case 'transaction-declined':
      console.log(`Transaction declined`);
      // TODO: notify the customer or retry with another payment instrument
      break;

    case 'customer-created':
      console.log(`Customer created`);
      // TODO: create the matching account in your system
      break;

    case 'subscription-activated':
      console.log(`Subscription activated`);
      // TODO: grant access
      break;

    case 'subscription-canceled':
      console.log(`Subscription canceled`);
      // TODO: schedule access removal
      break;

    case 'invoice-issued':
      console.log(`Invoice issued`);
      // TODO: email or store the invoice
      break;

    case 'invoice-paid':
      console.log(`Invoice paid`);
      // TODO: mark the order as paid
      break;

    case 'data-export-completed':
      console.log(`Data export completed: ${payload.dataExportId}`);
      // TODO: download the file from the "download" link in payload._links
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Rebilly sends GET, POST, PUT, PATCH or DELETE, as configured on the webhook, so accept them all.
// Read the body raw (any content type) and authenticate before parsing it.
app.all('/webhooks/rebilly', express.raw({ type: '*/*' }), (req, res) => {
  // Hookdeck never sends a 401 challenge, so the credentials must arrive with every request.
  if (!verifyRebillyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing basic auth credentials' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    // GET and DELETE webhooks (or an empty body template) carry no payload.
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
    console.error('Error handling Rebilly event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Rebilly retries unless the response is exactly HTTP 200, within 20 seconds.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRebillyRequest = verifyRebillyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/rebilly (GET, POST, PUT, PATCH, DELETE)`);
  });
}
