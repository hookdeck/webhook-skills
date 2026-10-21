// Generated with: lemon-squeezy-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Lemon Squeezy signs the raw request body, so verify before any JSON parsing.
// X-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  // timingSafeEqual throws on length mismatch, so check first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post(
  '/webhooks/lemon-squeezy',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.get('X-Signature');
    if (!signature) {
      return res.status(400).send('Missing X-Signature header');
    }

    if (!verifySignature(req.body, signature, process.env.LEMON_SQUEEZY_SIGNING_SECRET)) {
      console.error('Lemon Squeezy signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // X-Event-Name carries the event; meta.event_name has the same value
    const eventName = req.get('X-Event-Name') || payload.meta?.event_name;
    const resource = payload.data;
    // custom_data is whatever you passed to checkout (e.g. your user id)
    const customData = payload.meta?.custom_data;

    switch (eventName) {
      case 'order_created':
        console.log(`Order created: ${resource.id} (${resource.attributes.total_formatted})`, customData);
        break;
      case 'order_refunded':
        console.log(`Order refunded: ${resource.id}`);
        break;
      case 'subscription_created':
        console.log(`Subscription created: ${resource.id} (${resource.attributes.status})`, customData);
        break;
      case 'subscription_updated':
        console.log(`Subscription updated: ${resource.id} (${resource.attributes.status})`);
        break;
      case 'subscription_cancelled':
        console.log(`Subscription cancelled: ${resource.id}, ends at ${resource.attributes.ends_at}`);
        break;
      case 'subscription_payment_success':
        console.log(`Subscription payment succeeded: invoice ${resource.id}`);
        break;
      case 'license_key_created':
        console.log(`License key created: ${resource.id}`);
        break;
      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Lemon Squeezy retries up to 3 more times on any non-200 response
    res.status(200).json({ received: true });
  }
);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Lemon Squeezy webhook server listening on port ${PORT}`);
  });
}

module.exports = app;
