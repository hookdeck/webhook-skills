// Generated with: thinkific-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify X-Thinkific-Hmac-Sha256: the hex HMAC-SHA256 of the raw request body, keyed with the
 * secret's UTF-8 bytes. Nothing else is signed (no timestamp or id), so there is no replay window.
 * `rawBody` must be the exact bytes received.
 */
function verifyThinkificSignature(rawBody, signature, secret = process.env.THINKIFIC_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Dispatch on `resource` and `action`. cart.abandoned uses a different envelope
 * (`name` + `data`), so fall back to `name` when there is no resource.
 */
function handleEvent(event) {
  const topic = event.resource ? `${event.resource}.${event.action}` : event.name;
  const payload = event.payload || event.data || {};

  switch (event.resource) {
    case 'order':
      console.log(`Order ${payload.id} (${topic}): ${payload.product_name} for ${payload.amount_cents} cents`);
      // TODO: fulfil the order or record the sale
      break;

    case 'order_transaction':
      console.log(`Transaction ${payload.id} ${event.action}`); // succeeded, failed, refunded
      // TODO: update payment state
      break;

    case 'enrollment':
      console.log(`Enrollment ${payload.id} ${event.action} (user ${payload.user && payload.user.id})`);
      // TODO: grant access, send a certificate on "completed"
      break;

    case 'user':
      console.log(`User ${payload.id} ${event.action}`); // signup, signin, updated, deleted
      // TODO: sync the user record
      break;

    case 'course':
      console.log(`Course ${payload.id} ${event.action}`); // created, updated, deleted
      break;

    default:
      console.log(`Unhandled Thinkific event: ${topic}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before anything is parsed.
app.post('/webhooks/thinkific', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-thinkific-hmac-sha256'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyThinkificSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid or missing X-Thinkific-Hmac-Sha256 signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Thinkific event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyThinkificSignature = verifyThinkificSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/thinkific`);
  });
}
