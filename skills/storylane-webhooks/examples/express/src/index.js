// Generated with: storylane-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Standard padded base64 of a 32-byte HMAC-SHA256 digest: 43 chars + "="
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Storylane webhook signature.
 *
 * Storylane sends `x-storylane-signature: <base64>`: the standard base64 HMAC-SHA256 of the
 * raw request body, keyed with the Webhook Verification Secret. Nothing else is signed.
 */
function verifyStorylaneSignature(rawBody, signatureHeader, secret) {
  // Validate the shape first; this also rejects empty, missing and list-valued headers
  if (typeof signatureHeader !== 'string' || !BASE64_SHA256.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Both strings are 44 ASCII chars, so the Buffers have equal length; compare exactly
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}

// Read the raw body for ANY content type so the exact bytes are verified before parsing
app.post('/webhooks/storylane', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.STORYLANE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STORYLANE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyStorylaneSignature(rawBody, req.headers['x-storylane-signature'], secret)) {
    console.error('Storylane webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return res.status(400).send('Invalid payload');
  }

  // Dispatch on the top-level `event` field
  switch (payload.event) {
    case 'demo_viewed':
      // `lead` is an object for a known visitor and null for an anonymous one
      console.log(
        `Demo "${payload.name}" viewed (session ${payload.id}) by ${payload.lead?.email ?? 'an unknown visitor'}`
      );
      break;
    default:
      console.log(`Unhandled Storylane event: ${payload.event}`);
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Storylane webhook server listening on port ${port}`));
}

module.exports = { app, verifyStorylaneSignature };
