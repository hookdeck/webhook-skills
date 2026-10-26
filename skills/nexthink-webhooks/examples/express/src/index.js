// Generated with: nexthink-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Nexthink does not sign payloads. The credential is the `Authorization` header built from
 * the Bearer token connector credential ("<Header prefix> <Token>"). Compare the complete
 * header value, including the scheme prefix; don't strip, parse or decode it.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the credential if it leaks.
 */
function verifyNexthinkRequest(headers, config = process.env) {
  const expected = config.NEXTHINK_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Nexthink adds no event field: the body is the JSON template you wrote on the webhook.
 * This example uses an ILLUSTRATIVE template where `event` is a field you chose:
 *   { "event": "alert triggered", "monitor": "{{alert.monitor.name}}" }
 */
function handleEvent(payload) {
  const event = payload && typeof payload === 'object' ? payload.event : undefined;

  switch (event) {
    case 'alert triggered':
      console.log(`Alert triggered: ${payload.monitor}`);
      // TODO: open a ticket or notify the on-call channel
      break;

    case 'alert recovered':
      console.log(`Alert recovered: ${payload.monitor}`);
      // TODO: resolve the ticket
      break;

    default:
      console.log('Unrecognised Nexthink payload (no matching "event" in your template)');
  }
}

function handleWebhook(req, res) {
  // The body is raw so the request is authenticated before anything is parsed,
  // whatever Content-Type Nexthink uses.
  if (!verifyNexthinkRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  // The body may be empty (no Payload template).
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Nexthink webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

// The request method is chosen on the Nexthink webhook: POST, PUT or PATCH.
const rawBody = express.raw({ type: '*/*' });
app
  .route('/webhooks/nexthink')
  .post(rawBody, handleWebhook)
  .put(rawBody, handleWebhook)
  .patch(rawBody, handleWebhook);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNexthinkRequest = verifyNexthinkRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST/PUT/PATCH http://localhost:${PORT}/webhooks/nexthink`);
  });
}
