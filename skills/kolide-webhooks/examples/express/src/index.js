// Generated with: kolide-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// 1Password Device Trust (Kolide) sends the signature in the Authorization header as a BARE
// lowercase hex digest: no "Bearer", no prefix, no timestamp.
//   Authorization: hex( HMAC-SHA256( endpoint secret as UTF-8 bytes, raw request body ) )
// Only the body is signed, so there is no replay window to check.
// https://support.1password.com/device-trust-webhooks/

// Hex is case-insensitive (Hookdeck's source compares it that way too). Check the format
// first: Buffer.from(x, 'hex') silently drops bad characters.
function verifyKolide(rawBody, authorization, secret) {
  if (!secret || typeof authorization !== 'string') return false;
  const received = authorization.trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = crypto
    .createHmac('sha256', secret) // secret string used as-is: UTF-8 bytes, not hex/base64 decoded
    .update(rawBody) // raw bytes exactly as received
    .digest(); // 32 bytes

  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// Parsed JSON is untrusted: only read fields after checking their type.
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined);

// Raw body is required: the signature covers the exact bytes Kolide sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/kolide', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.KOLIDE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('KOLIDE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyKolide(rawBody, req.headers.authorization, secret)) {
    console.error('Kolide webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(event) || typeof event.event !== 'string') {
    return res.status(400).send('Invalid payload');
  }

  // Envelope: { event, id, timestamp, data }. Dispatch on `event`; dedupe on `id`.
  const data = isObject(event.data) ? event.data : {};
  switch (event.event) {
    case 'webhook.test':
      console.log('Test webhook received');
      break;
    case 'devices.created':
      console.log(`Device created: ${text(data.device_name)} (id ${text(data.device_id)})`);
      break;
    case 'devices.registered': {
      const owner = isObject(data.registered_owner) ? data.registered_owner : {};
      console.log(`Device registered: ${text(data.device_name)} by ${text(owner.email)}`);
      break;
    }
    case 'devices.destroyed':
      console.log(`Device destroyed: ${text(data.device_name)} (id ${text(data.device_id)})`);
      break;
    case 'device_trust.status_changed':
      console.log(`Device ${text(data.device_name)} is now ${text(data.device_status)}`);
      break;
    case 'issues.new':
    case 'issues.resolved': {
      const device = isObject(data.device) ? data.device : {};
      const check = isObject(data.check) ? data.check : {};
      console.log(`${event.event}: ${text(check.name)} on ${text(device.name)}`);
      break;
    }
    case 'auth_logs.success':
    case 'auth_logs.failure':
      console.log(`${event.event}: ${text(data.device_name)} via ${text(data.browser_name)}`);
      break;
    case 'audit_log.recorded':
      console.log(`Audit log: ${text(data.actor_name)}: ${text(data.description)}`);
      break;
    default:
      // admin_users.created, requests.issue_exemption, requests.registration, ...
      console.log(`Unhandled event: ${event.event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Kolide webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyKolide };
