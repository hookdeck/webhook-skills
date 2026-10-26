// Generated with: tremendous-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify Tremendous-Webhook-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body
 * keyed with the webhook's private_key.
 */
function verifyTremendousWebhook(rawBody, signatureHeader, privateKey) {
  if (!signatureHeader || !privateKey || !signatureHeader.startsWith('sha256=')) return false;

  const sig = signatureHeader.slice('sha256='.length);
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the shape first
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;

  const expected = crypto.createHmac('sha256', privateKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

// Raw body for ANY content type: the signature covers the exact bytes sent
app.post('/webhooks/tremendous', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('Tremendous-Webhook-Signature');

  if (!signature) {
    return res.status(400).send('Missing Tremendous-Webhook-Signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyTremendousWebhook(req.body, signature, process.env.TREMENDOUS_WEBHOOK_PRIVATE_KEY)) {
    console.error('Tremendous signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Tremendous retries up to 17 times unless it gets a 200: dedupe on event.uuid
  const resource = event.payload?.resource;

  switch (event.event) {
    case 'REWARDS.DELIVERY.SUCCEEDED':
      console.log(`Reward ${resource?.id} delivered`);
      break;
    case 'REWARDS.DELIVERY.FAILED':
      console.error(`Reward ${resource?.id} delivery failed:`, event.payload?.meta);
      break;
    case 'REWARDS.CANCELED':
      console.log(`Reward ${resource?.id} canceled`);
      break;
    case 'REWARDS.FLAGGED':
      console.log(`Reward ${resource?.id} flagged for fraud review`);
      break;
    case 'ORDERS.CREATED':
      console.log(`Order ${resource?.id} created`);
      break;
    case 'ORDERS.APPROVED':
      console.log(`Order ${resource?.id} approved`);
      break;
    case 'ORDERS.CANCELED':
      console.log(`Order ${resource?.id} canceled`);
      break;
    case 'ORDERS.FAILED':
      console.error(`Order ${resource?.id} failed`);
      break;
    case 'CAMPAIGNS.CREATED':
      console.log(`Campaign ${resource?.id} created`);
      break;
    case 'FUNDING_SOURCES.FUNDED':
      console.log(`Funding source ${resource?.id} funded`);
      break;
    case 'INVOICES.PAID':
      console.log(`Invoice ${resource?.id} paid`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  // Acknowledge fast; do heavy work off the request path
  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tremendous webhook server listening on port ${PORT}`);
  });
}

module.exports = { app, verifyTremendousWebhook };
