// Generated with: buttondown-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Buttondown signs a delivery only if the webhook has a signing key. The header is
//   X-Buttondown-Signature: sha256=<hex>
// where <hex> is HMAC-SHA256 of the raw request body, keyed with the signing key (UTF-8, used as-is).
// Nothing else is signed: no timestamp, no id, so there is no replay window to check.
// https://docs.buttondown.com/api-webhooks-introduction

function verifyButtondown(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  // Accept the value with or without the sha256= prefix
  const signature = signatureHeader.trim().replace(/^sha256=/i, '');

  // Check for exactly 64 hex chars before Buffer.from(x, 'hex'): invalid hex silently truncates.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(); // 32 bytes
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

// Raw body is required: the signature covers the exact bytes Buttondown sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/buttondown', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BUTTONDOWN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BUTTONDOWN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyButtondown(rawBody, req.headers['x-buttondown-signature'], secret)) {
    console.error('Buttondown webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Payload: { event_type, data }. data holds ids (newsletter, subscriber, ...).
  // Delivery is at least once and unordered: make handlers idempotent.
  const data = event.data || {};
  switch (event.event_type) {
    case 'subscriber.created':
      console.log(`Subscriber ${data.subscriber} created on newsletter ${data.newsletter}`);
      break;
    case 'subscriber.confirmed':
      console.log(`Subscriber ${data.subscriber} confirmed on newsletter ${data.newsletter}`);
      break;
    case 'subscriber.unsubscribed':
      console.log(`Subscriber ${data.subscriber} unsubscribed from newsletter ${data.newsletter}`);
      break;
    case 'email.sent':
      console.log(`Email ${data.email} finished sending`);
      break;
    case 'automation.invoked':
      console.log(`Automation invoked on newsletter ${data.newsletter}`);
      break;
    default:
      console.log(`Unhandled event: ${event.event_type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Buttondown webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyButtondown };
