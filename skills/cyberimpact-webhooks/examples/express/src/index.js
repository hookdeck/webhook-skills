// Generated with: cyberimpact-webhooks skill
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
 * Cyberimpact does not sign payloads. The scenario author adds a key-value pair to the
 * webhook headers; we compare that header's WHOLE value (no Bearer parsing) with the secret.
 */
function verifyCyberimpactRequest(headers, {
  name = process.env.CYBERIMPACT_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.CYBERIMPACT_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'automation.webhook.send':
      console.log(`Automation webhook for contact ${data.id} (${data.email})`);
      // TODO: add/update the contact in your CRM, send an alert, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/cyberimpact', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCyberimpactRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
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
    console.error('Error handling Cyberimpact event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCyberimpactRequest = verifyCyberimpactRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cyberimpact`);
  });
}
