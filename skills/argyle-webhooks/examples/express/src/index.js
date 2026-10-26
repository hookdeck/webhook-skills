// Generated with: argyle-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Argyle's docs don't name the HTTP method, so accept all of these.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/; // HMAC-SHA512 as hex = 128 characters

/**
 * Argyle signs the raw request body with HMAC-SHA512, keyed with the subscription
 * secret (UTF-8 bytes, used as-is), and sends the bare hex digest in X-Argyle-Signature.
 * Nothing else is signed (no timestamp, no id), so there is no replay window to check.
 * Hex is case-insensitive: validate the format, lowercase, compare in constant time.
 */
function verifyArgyleSignature(rawBody, signature, secret = process.env.ARGYLE_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase(), 'utf8'); // validated ASCII hex, compared as text
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleEvent(payload) {
  const { event } = payload;

  switch (event) {
    case 'accounts.added':
    case 'accounts.connected':
    case 'accounts.failed':
    case 'accounts.removed':
    case 'accounts.updated':
      console.log(`Account event ${event}: account ${payload.data?.account}, user ${payload.data?.user}`);
      // TODO: update the connection state for payload.data.account
      break;

    case 'gigs.added':
    case 'gigs.updated':
    case 'gigs.removed':
    case 'gigs.partially_synced':
    case 'gigs.fully_synced':
      console.log(`Gig event ${event}:`, JSON.stringify(payload.data));
      // TODO: fetch the changed gigs by id from the Argyle API
      break;

    case 'identities.added':
    case 'identities.updated':
      console.log(`Identity event ${event}:`, JSON.stringify(payload.data));
      // TODO: fetch the identity by id and refresh your records
      break;

    case 'items.updated':
    case 'items.removed':
      console.log(`Item event ${event}:`, JSON.stringify(payload.data));
      // TODO: refresh your list of supported employers and platforms
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

function handleWebhook(req, res) {
  // Verify first, for every method. A missing body is verified as zero bytes.
  // express.raw leaves req.body undefined (or {}) when there is no body.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-argyle-signature']; // Node lowercases header names

  if (!verifyArgyleSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid or missing X-Argyle-Signature' });
  }

  // Verified. An empty body (e.g. GET) is acknowledged, not rejected as bad JSON.
  if (rawBody.length === 0 || rawBody.toString('utf8').trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Argyle event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Answer 200 within 10 s. Deliveries can repeat: make handlers idempotent.
  res.status(200).json({ received: true });
}

// Read the body raw (any content type) so the exact bytes are verified; parse after the check.
for (const method of METHODS) {
  app[method]('/webhooks/argyle', express.raw({ type: '*/*' }), handleWebhook);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyArgyleSignature = verifyArgyleSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/argyle`);
  });
}
