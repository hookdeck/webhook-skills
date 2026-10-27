// Generated with: lodgix-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Lodgix-Signature: sha256=<hex of HMAC_SHA256(secret, "{timestamp}.{raw body}")>.
 * `rawBody` must be the exact bytes received. Returns { valid, error }.
 */
function verifyLodgixSignature(rawBody, timestamp, signature, secret, toleranceSeconds = 0) {
  if (!timestamp || !signature) {
    return { valid: false, error: 'Missing X-Lodgix-Timestamp or X-Lodgix-Signature header' };
  }

  // Accept the value with or without the "sha256=" prefix, then validate before decoding
  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { valid: false, error: 'Malformed signature' };
  }

  // Signed message as bytes: timestamp header (latin1) + "." + raw body bytes
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  const provided = Buffer.from(hex.toLowerCase(), 'hex');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^[0-9]+$/.test(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}

// Raw body for any content type, so the exact bytes are verified
app.post('/webhooks/lodgix', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LODGIX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LODGIX_WEBHOOK_SECRET is not set');
    return res.status(500).send('Server misconfigured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyLodgixSignature(
    rawBody,
    req.get('x-lodgix-timestamp'),
    req.get('x-lodgix-signature'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error(`Lodgix signature verification failed: ${result.error}`);
    return res.status(401).send(result.error);
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const event = req.get('x-lodgix-event');
  const deliveryId = req.get('x-lodgix-delivery'); // use for idempotency

  switch (event) {
    case 'message.received':
      // Illustrative payload: Lodgix does not document the body shape
      console.log(`Guest message received (delivery ${deliveryId}):`, payload);
      break;
    default:
      console.log(`Unhandled Lodgix event: ${event}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Lodgix webhook server listening on port ${port}`));
}

module.exports = { app, verifyLodgixSignature };
