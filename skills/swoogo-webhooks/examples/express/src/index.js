// Generated with: swoogo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

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
 * Swoogo does not sign payloads. The user adds a secret header to the webhook
 * (headers: [{key, value}]). The name is user-chosen, so it comes from
 * SWOOGO_WEBHOOK_HEADER; the expected value is the exact, whole header value
 * (including any "Bearer " prefix), so it is compared as-is, never parsed.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifySwoogoRequest(
  headers,
  name = process.env.SWOOGO_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.SWOOGO_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

/** Webhooks are json (application/json) or post (form-encoded): accept both. */
function parseBody(raw, contentType = '') {
  if (contentType.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// The body names neither the object nor the action, so this skill's convention is one
// Swoogo webhook per trigger_object, with ?object=<trigger_object> in the webhook URL.
// Payloads are illustrative: they carry whatever fields the webhook was configured to send.
function handleChange(object, payload) {
  switch (object) {
    case 'event':
      console.log(`Event changed: ${payload.id}`);
      // TODO: sync event details
      break;

    case 'contact':
      console.log(`Contact changed: ${payload.id}`);
      // TODO: sync the contact to your CRM
      break;

    case 'registrant':
      console.log(`Registrant changed: ${payload.id}`);
      // TODO: upsert the registrant (insert and update both arrive here)
      break;

    case 'speaker':
      console.log(`Speaker changed: ${payload.id}`);
      // TODO: sync the speaker roster
      break;

    case 'sponsor':
      console.log(`Sponsor changed: ${payload.id}`);
      // TODO: sync the sponsor list
      break;

    case 'session':
      console.log(`Session changed: ${payload.id}`);
      // TODO: refresh the agenda
      break;

    case 'session_attendance':
      console.log(`Session attendance changed: ${payload.id}`);
      // TODO: record the check-in
      break;

    case 'registrant_line_item':
      console.log(`Registrant line item changed: ${payload.id}`);
      // TODO: update fees and purchases
      break;

    default:
      console.log(`Unhandled trigger object: ${object}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/swoogo', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySwoogoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const payload = parseBody(raw, req.headers['content-type'] || '');
  if (!payload) {
    return res.status(400).json({ error: 'Expected a JSON object or form-encoded body' });
  }

  try {
    handleChange(req.query.object, payload);
  } catch (err) {
    console.error('Error handling Swoogo webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySwoogoRequest = verifySwoogoRequest;
module.exports.parseBody = parseBody;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/swoogo?object=registrant`);
  });
}
