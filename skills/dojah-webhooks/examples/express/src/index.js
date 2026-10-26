// Generated with: dojah-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Dojah signs the raw POST body with HMAC-SHA256 keyed on the subscription's
 * webhook secret (UTF-8) and sends a bare lowercase hex digest in
 * x-dojah-signature (no prefix, no timestamp). x-dojah-signature-v2 is a static
 * hash of the secret with no payload, so it is not checked here.
 */
function verifyDojahSignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') {
    return false;
  }

  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Raw body (any Content-Type) so the signature is computed over the exact bytes sent
app.post('/webhooks/dojah', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Missing, empty, malformed or mismatched signature: 401
  if (!verifyDojahSignature(rawBody, req.get('x-dojah-signature'), process.env.DOJAH_WEBHOOK_SECRET)) {
    console.error('Dojah webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Treat every field as untrusted: check types before reading into the body
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).send('Invalid payload');
  }

  // No event-name field: the URL is subscribed to one service. For kyc_widget,
  // dispatch on verification_status and look the session up by reference_id.
  const referenceId = typeof payload.reference_id === 'string' ? payload.reference_id : undefined;

  switch (payload.verification_status) {
    case 'Completed':
      // Completed means finished, not passed: check the top-level status too
      if (payload.status === true) {
        console.log('Verification completed and passed:', referenceId);
      } else {
        console.log('Verification completed but not passed:', referenceId);
      }
      break;
    case 'Failed':
      console.log('Verification failed:', referenceId);
      break;
    case 'Abandoned':
      console.log('Verification abandoned:', referenceId);
      break;
    case 'Pending':
      console.log('Verification pending review:', referenceId);
      break;
    case 'Ongoing':
      console.log('Verification ongoing:', referenceId);
      break;
    default:
      // Other services (sms, address, AML Monitoring) have their own shapes
      console.log('Unhandled Dojah event');
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dojah webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/dojah`);
  });
}

module.exports = { app, verifyDojahSignature };
