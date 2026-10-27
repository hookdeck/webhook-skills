// Generated with: cyera-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Cyera Privacy signs: base64( HMAC-SHA256( secret, "{X-Webhook-Timestamp}:{raw body}" ) )
// and sends the bare, padded, standard-base64 digest in X-Webhook-Signature.
const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Cyera Privacy webhook.
 *
 * The signed message is built as BYTES: the timestamp header value (exact
 * string, latin1), a literal ":", then the raw body bytes as received. The body
 * is never decoded, parsed or re-serialized.
 *
 * @param {Buffer} rawBody  exact request bytes
 * @param {object} headers  Node-style (lowercased) request headers
 * @param {string} secret   Webhook Secret, used as UTF-8 bytes
 * @param {number} toleranceSeconds  0 = no timestamp window (default)
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyCyeraSignature(rawBody, headers, secret, toleranceSeconds = 0) {
  const signature = headers['x-webhook-signature'];
  const timestamp = headers['x-webhook-timestamp'];

  if (!signature) return { valid: false, error: 'Missing X-Webhook-Signature header' };
  if (!timestamp) return { valid: false, error: 'Missing X-Webhook-Timestamp header' };

  // Validate the format BEFORE decoding: Buffer.from(x, 'base64') silently
  // drops bad characters.
  if (!SIGNATURE_RE.test(signature)) {
    return { valid: false, error: 'Malformed X-Webhook-Signature (expected 44-char padded base64)' };
  }

  const signedMessage = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from(':', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedMessage)
    .digest();

  const received = Buffer.from(signature, 'base64');
  // Exact (case-sensitive, canonical) base64 only.
  if (received.length !== expected.length || received.toString('base64') !== signature) {
    return { valid: false, error: 'Malformed X-Webhook-Signature' };
  }
  if (!crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Optional replay window. Off by default: Hookdeck retries and replays resend
  // the original headers, so a fixed window would reject legitimate redeliveries.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) {
      return { valid: false, error: 'X-Webhook-Timestamp is not Unix seconds' };
    }
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}

// Read the raw bytes for ANY content type, so the exact body is what gets verified.
app.post('/webhooks/cyera', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CYERA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CYERA_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyCyeraSignature(rawBody, req.headers, secret, tolerance);
  if (!result.valid) {
    console.error(`Cyera signature verification failed: ${result.error}`);
    return res.status(401).send(result.error);
  }

  // Parse only AFTER the signature check.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  switch (payload.request_type) {
    case 'health_check':
      // Cyera pings the endpoint to check it is alive.
      return res.status(200).json({ received: true });

    case 'access':
    case 'deletion':
    case 'opt_out':
      // Queue the data-subject request, then answer 201 Created. Completion is
      // reported LATER by a PUT to payload.webhook_callback_url (API key auth).
      console.log(
        `Cyera ${payload.request_type} request`,
        payload.privacy_request_id || payload.opt_out_request_id,
        payload.topic
      );
      return res.status(201).json({ received: true });

    case 'readiness_check':
      // Cyera asks whether this system is ready to process the request.
      console.log('Cyera readiness check', payload.privacy_request_id);
      return res.status(200).json({ received: true });

    default:
      console.log(`Unhandled Cyera request_type: ${payload.request_type}`);
      return res.status(200).json({ received: true });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Cyera webhook server listening on http://localhost:${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/cyera`);
  });
}

module.exports = { app, verifyCyeraSignature };
