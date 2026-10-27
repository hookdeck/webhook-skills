// Generated with: creem-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Creem sends creem-signature: bare lowercase hex HMAC-SHA256 of the raw request
 * body, keyed with the endpoint's signing secret used as a UTF-8 string (no prefix, no timestamp).
 * The 64-hex check comes first because Buffer.from(x, 'hex') silently truncates bad input.
 */
function verifyCreemSignature(rawBody, signature, secret = process.env.CREEM_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function handleEvent(body) {
  const { eventType } = body;
  const resource = body.object || {};

  switch (eventType) {
    case 'checkout.completed':
      console.log('Checkout completed', resource.id, resource.order && resource.order.id);
      // TODO: fulfil the order; resource.metadata / resource.request_id carry your own reference
      break;

    case 'subscription.paid':
      console.log('Subscription paid', resource.id);
      // TODO: grant or extend access (Creem recommends this event over subscription.active)
      break;

    case 'subscription.active':
    case 'subscription.trialing':
    case 'subscription.update':
    case 'subscription.paused':
      console.log(`Subscription state change (${eventType})`, resource.id, resource.status);
      // TODO: sync the subscription record
      break;

    case 'subscription.scheduled_cancel':
      console.log('Subscription scheduled to cancel', resource.id, resource.current_period_end_date);
      // TODO: notify the customer or offer a retention incentive
      break;

    case 'subscription.past_due':
    case 'subscription.unpaid':
      console.log(`Subscription payment problem (${eventType})`, resource.id);
      // TODO: prompt for a payment-method update; suspend access per your policy
      break;

    case 'subscription.canceled':
    case 'subscription.expired':
      console.log(`Subscription ended (${eventType})`, resource.id);
      // TODO: revoke access
      break;

    case 'refund.created':
      console.log('Refund created', resource.id, resource.refund_amount, resource.refund_currency);
      break;

    case 'dispute.created':
      console.log('Dispute created', resource.id, resource.amount, resource.currency);
      // TODO: alert your team
      break;

    case 'credits.granted':
    case 'credits.consumed':
    case 'credits.auto_recharged':
    case 'customer_credits.exhausted':
      console.log(`Customer credits event (${eventType})`, resource.customer_id, resource.bucket_name);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the signature covers the exact bytes received.
app.post('/webhooks/creem', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyCreemSignature(rawBody, req.headers['creem-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(body);
  } catch (err) {
    console.error('Error handling Creem event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCreemSignature = verifyCreemSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/creem`);
  });
}
