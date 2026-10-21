// Generated with: maxio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Maxio (Chargify) webhook.
 * Header X-Chargify-Webhook-Signature-Hmac-Sha-256 = hex HMAC-SHA256 of the
 * raw form body, keyed with the Site Shared Key (raw string).
 */
function verifyMaxio(rawBody, signatureHeader, sharedKey) {
  if (!signatureHeader || !sharedKey) return false;
  const expected = crypto.createHmac('sha256', sharedKey).update(rawBody).digest('hex');
  const provided = String(signatureHeader).trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Raw body is required: the signature covers the exact form-encoded bytes.
app.post('/webhooks/maxio', express.raw({ type: '*/*' }), (req, res) => {
  const sharedKey = process.env.MAXIO_SHARED_KEY;
  if (!sharedKey) {
    console.error('MAXIO_SHARED_KEY not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const signature = req.get('X-Chargify-Webhook-Signature-Hmac-Sha-256');
  if (!signature) {
    return res.status(400).json({ error: 'Missing signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyMaxio(rawBody, signature, sharedKey)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Parse the form only after verification. Keys like payload[subscription][id]
  // stay as literal flat keys.
  const form = Object.fromEntries(new URLSearchParams(rawBody.toString('utf8')));
  const event = form.event;

  switch (event) {
    case 'signup_success':
      console.log('Signup succeeded');
      break;
    case 'payment_success':
      console.log('Payment succeeded');
      break;
    case 'payment_failure':
      console.log('Payment failed');
      break;
    case 'renewal_success':
      console.log('Renewal succeeded');
      break;
    case 'subscription_state_change':
      console.log('Subscription state changed');
      break;
    case 'test':
      console.log('Test webhook received');
      break;
    default:
      console.log('Unhandled event:', event);
  }

  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Maxio webhook server listening on port ${port}`));
}

module.exports = { app, verifyMaxio };
