// Generated with: high-mobility-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// High Mobility signs every delivery:
//   X-HM-Signature-256: sha256=<lowercase hex>
// = HMAC-SHA256 of the raw body bytes only, keyed with the webhook secret's UTF-8 bytes as-is.
// The deprecated X-HM-Signature (HMAC-SHA1) is ignored.
// https://docs.high-mobility.com/docs/webhooks

function verifyHighMobility(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (/^sha256=/i.test(sig)) sig = sig.slice('sha256='.length); // bare digest is accepted too
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false; // validate before comparing
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  );
  const received = Buffer.from(sig.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

function handleHighMobility(req, res) {
  const secret = process.env.HIGH_MOBILITY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HIGH_MOBILITY_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  // A request without a body leaves req.body undefined: verify it over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyHighMobility(rawBody, req.headers['x-hm-signature-256'], secret)) {
    console.error('High Mobility webhook signature verification failed');
    return res.status(401).send('Unauthorized');
  }

  // Verified and empty (e.g. a GET): acknowledge.
  if (rawBody.length === 0) return res.json({ received: true });

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(body)) return res.status(400).send('Invalid payload');

  // Everything in the body is untrusted: check each nested value's type before reading it.
  // Duplicates and out-of-order deliveries are possible, so keep handlers idempotent.
  const event = isObject(body.event) ? body.event : {};
  const vehicle = isObject(body.vehicle) ? body.vehicle : {};
  const type = str(event.type);

  switch (type) {
    case 'fleet_clearance_changed':
      console.log(`Fleet clearance changed for ${str(vehicle.vin)}: ${str(event.action)} ${str(event.detail) ?? ''}`.trim());
      break;
    case 'ping':
      console.log('Ping received (webhook configuration changed)');
      break;
    default:
      console.log(`Unhandled event: ${type}`);
  }

  res.json({ received: true });
}

// High Mobility's docs don't name the HTTP method, so accept all of these.
// Raw body: the signature covers the exact bytes sent; type '*/*' verifies any Content-Type.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
for (const method of METHODS) {
  app[method]('/webhooks/high-mobility', express.raw({ type: '*/*' }), handleHighMobility);
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`High Mobility webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyHighMobility };
