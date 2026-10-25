// Generated with: axiom-webhooks skill
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
 * Axiom does not sign requests. You add a secret header to the Custom webhook
 * notifier; the name is user-chosen (AXIOM_WEBHOOK_HEADER, default Authorization)
 * and the expected value is the exact, whole header value (AXIOM_WEBHOOK_SECRET),
 * including any "Bearer " prefix. Nothing is stripped or parsed.
 */
function verifyAxiomRequest(headers, {
  name = process.env.AXIOM_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.AXIOM_WEBHOOK_SECRET,
} = {}) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// The body is a Go template the notifier's author writes. These handlers assume the
// default template: state in `action` (Open / Closed), monitor data under `event`.
function handleEvent(payload) {
  const { action, event = {} } = payload;

  switch (action) {
    case 'Open':
      console.log(`Monitor opened: ${event.title} (${event.monitorID})`);
      // TODO: page on-call or open an incident (event.body, event.value, event.matchedEvent)
      break;

    case 'Closed':
      console.log(`Monitor closed: ${event.title} (${event.monitorID})`);
      // TODO: resolve the matching incident
      break;

    default:
      console.log(`Unhandled action: ${action}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/axiom', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAxiomRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
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
    console.error('Error handling Axiom notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAxiomRequest = verifyAxiomRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/axiom`);
  });
}
