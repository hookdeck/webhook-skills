// Generated with: texture-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Texture-Signature is the lowercase hex HMAC-SHA256 of the raw request body, keyed with the
 * destination secret (UTF-8 bytes, used as-is, whsec_ prefix included). Nothing else is signed.
 * Validate the format before decoding: Buffer.from(sig, 'hex') silently drops bad characters.
 */
function verifyTextureSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  return crypto.timingSafeEqual(expected, received); // both are 32 bytes
}

function handleEvent(event) {
  switch (event.type) {
    case 'device.discovered':
      console.log(`Device discovered: ${event.deviceId}`);
      // TODO: register the device in your system
      break;

    case 'device.updated':
      console.log(`Device updated: ${event.deviceId}`);
      // TODO: sync device state
      break;

    case 'device.disconnected':
      console.log(`Device disconnected: ${event.deviceId}`);
      break;

    case 'command.succeeded':
      console.log(`Command succeeded for device ${event.deviceId}`);
      break;

    case 'command.failed':
      console.log(`Command failed for device ${event.deviceId}`);
      // TODO: retry or alert
      break;

    case 'command.overridden':
      console.log(`Command overridden for device ${event.deviceId}`);
      break;

    case 'customer.created':
      console.log('Customer created');
      break;

    case 'enrollment.approved':
      console.log('Enrollment approved');
      break;

    case 'site.created':
      console.log('Site created');
      break;

    default:
      console.log(`Unhandled Texture event type: ${event.type}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified; parse only afterwards.
app.post('/webhooks/texture', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyTextureSignature(rawBody, req.headers['texture-signature'], process.env.TEXTURE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
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

  // Events can arrive out of order and be retried: dedupe on event.key before side effects.
  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Texture webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTextureSignature = verifyTextureSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/texture`);
  });
}
