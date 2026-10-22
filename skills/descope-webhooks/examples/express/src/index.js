// Generated with: descope-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Descope signs the exact JSON string it sends: HMAC-SHA256, base64 encoded,
// in the x-descope-webhook-s256 header.
function verifyDescopeSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'base64');
  if (received.length !== expected.length) return false; // timingSafeEqual needs equal length
  return crypto.timingSafeEqual(received, expected);
}

// Raw body required: express.raw with '*/*' so any Content-Type is verified as bytes
app.post('/webhooks/descope', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DESCOPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DESCOPE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.get('x-descope-webhook-s256');
  if (!signature) {
    return res.status(400).send('Missing x-descope-webhook-s256 header');
  }
  if (!Buffer.isBuffer(req.body) || !verifyDescopeSignature(req.body, signature, secret)) {
    console.error('Descope signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let events;
  try {
    events = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  // The connector posts a JSON array of up to 100 audit events
  if (!Array.isArray(events)) events = [events];

  for (const event of events) {
    switch (event.action) {
      case 'LoginSucceed':
        console.log(`Login succeeded for ${(event.loginIds || []).join(', ')}`);
        break;
      case 'LoginFailed':
        console.log(`Login failed: ${event.data && event.data.error_message}`);
        break;
      case 'UserCreated':
        console.log(`User created: ${event.userId}`);
        break;
      case 'UserModified':
        console.log(`User modified: ${event.userId}`);
        break;
      case 'UserDeleted':
        console.log(`User deleted: ${event.userId}`);
        break;
      case 'Change Password': // some actions contain a literal space
        console.log(`Password changed for user ${event.userId}`);
        break;
      default:
        console.log(`Unhandled Descope audit event: ${event.action}`);
    }
  }

  res.status(200).json({ received: true, count: events.length });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Descope webhook server listening on port ${PORT}`));
}

module.exports = app;
