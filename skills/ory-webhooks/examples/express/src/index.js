// Generated with: ory-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Ory lets you pick the HTTP method for each action, so accept all the useful ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Ory does not sign webhooks. With auth.type api_key (in: header) it sends
 * `<name>: <value>`, both chosen by you. Compare the WHOLE header value, including any
 * "Bearer " prefix you typed. A static credential authenticates the sender, not the
 * body, and gives no replay protection.
 */
function verifyOryRequest(
  headers,
  secret = process.env.ORY_WEBHOOK_SECRET,
  headerName = process.env.ORY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  // `event` comes from YOUR Jsonnet template; these names are the illustrative ones.
  const { event, identity } = payload;
  const id = identity && identity.id;

  switch (event) {
    case 'registration.after':
      console.log(`Identity registered: ${id}`);
      // TODO: add the user to your CRM or newsletter
      break;

    case 'login.after':
      console.log(`Identity logged in: ${id}`);
      // TODO: record the sign-in
      break;

    case 'settings.after':
      console.log(`Identity updated settings: ${id}`);
      // TODO: sync updated traits
      break;

    case 'verification.after':
      console.log(`Identity verified an address: ${id}`);
      // TODO: mark the address as verified downstream
      break;

    case 'recovery.after':
      console.log(`Identity recovered account: ${id}`);
      // TODO: notify the user
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/ory', express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(405).set('Allow', ALLOWED_METHODS.join(', ')).json({ error: 'Method not allowed' });
  }

  if (!verifyOryRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  // The body is optional (a GET action has none).
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Expected a JSON object' });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Ory event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOryRequest = verifyOryRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ory`);
  });
}
