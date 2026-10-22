// Generated with: sendcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Sendcloud signs the entire raw body: HMAC-SHA256, bare hex, Sendcloud-Signature header
function verifySendcloudSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// express.raw with '*/*' so the body is a Buffer whatever the content type is
app.post('/webhooks/sendcloud', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SENDCLOUD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SENDCLOUD_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.get('Sendcloud-Signature');
  if (!signature) {
    return res.status(400).send('Missing Sendcloud-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySendcloudSignature(rawBody, signature, secret)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (event.action) {
    case 'parcel_status_changed':
      // Webhooks can arrive out of order: compare event.timestamp before overwriting state
      console.log(`Parcel ${event.parcel?.id} -> ${event.parcel?.status?.message}`);
      break;
    case 'return_created':
      console.log(`Return ${event.data?.id} created for order ${event.data?.order_number}`);
      break;
    case 'integration_connected':
    case 'integration_updated':
    case 'integration_deleted':
      console.log(`${event.action}: integration ${event.integration?.id}`);
      break;
    default:
      console.log(`Unhandled action: ${event.action}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
}

module.exports = { app, verifySendcloudSignature };
