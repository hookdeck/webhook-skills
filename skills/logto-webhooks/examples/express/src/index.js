// Generated with: logto-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

// Logto sends the bare hex HMAC-SHA256 of the raw body in logto-signature-sha-256.
// Nothing else is signed (no timestamp), so there is no replay window to check.
function verifyLogtoSignature(rawBody, signatureHeader, secret) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) return false;
  // Validate the format before decoding: Buffer.from(x, 'hex') drops bad characters silently
  if (!HEX_DIGEST.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

// Parsed fields are untrusted: check types before reading into them
function userIdOf(body) {
  if (str(body.userId)) return body.userId;
  return isObject(body.user) ? str(body.user.id) : undefined;
}

function dataIdOf(body) {
  return isObject(body.data) ? str(body.data.id) : undefined;
}

// Raw body required: express.raw with '*/*' so any Content-Type is verified as bytes
app.post('/webhooks/logto', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LOGTO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOGTO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  if (!verifyLogtoSignature(req.body, req.get('logto-signature-sha-256'), secret)) {
    console.error('Logto signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(body) || typeof body.event !== 'string') {
    return res.status(400).send('Invalid payload');
  }

  // Dispatch on the top-level `event`; interactionEvent is not the event name
  switch (body.event) {
    case 'PostRegister':
      console.log(`User registered: ${userIdOf(body)}`);
      break;
    case 'PostSignIn':
      console.log(`User signed in: ${userIdOf(body)} (app ${isObject(body.application) ? str(body.application.name) : undefined})`);
      break;
    case 'PostResetPassword':
      console.log(`Password reset for user ${userIdOf(body)}`);
      break;
    case 'User.Created':
      console.log(`User created: ${dataIdOf(body)}`);
      break;
    case 'User.Data.Updated':
      console.log(`User updated: ${dataIdOf(body)}`);
      break;
    case 'User.Deleted': // data is null
      console.log('User deleted');
      break;
    case 'User.SuspensionStatus.Updated':
      console.log(`User suspension status changed: ${dataIdOf(body)}`);
      break;
    case 'Grant.LimitExceeded':
      console.log(`Grant limit exceeded for user ${userIdOf(body)}, revoked ${Array.isArray(body.revokedGrantIds) ? body.revokedGrantIds.length : 0} grant(s)`);
      break;
    default:
      console.log(`Unhandled Logto event: ${body.event}`);
  }

  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Logto webhook server listening on port ${PORT}`));
}

module.exports = app;
