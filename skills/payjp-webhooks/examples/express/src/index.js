// Generated with: payjp-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * PAY.JP does not sign payloads. Every webhook carries X-Payjp-Webhook-Token, the
 * account's webhook token (whook_...). It authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate the token if it leaks.
 */
function verifyPayjpRequest(headers, secret = process.env.PAYJP_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-payjp-webhook-token'];
  return Boolean(received) && safeEqual(received, secret);
}

// Demo dedupe store. Use a shared store (Redis, database) with a TTL in production.
const seenEvents = new Set();

function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    case 'charge.succeeded':
      console.log(`Charge succeeded: ${data.id} (${data.amount} ${data.currency})`);
      // TODO: fulfil the order
      break;

    case 'charge.failed':
      console.log(`Charge failed: ${data.id} (${data.failure_code})`);
      // TODO: notify the customer
      break;

    case 'charge.updated':
      console.log(`Charge updated: ${data.id}`);
      // TODO: sync metadata
      break;

    case 'charge.refunded':
      console.log(`Charge refunded: ${data.id} (${data.amount_refunded} refunded)`);
      // TODO: reverse fulfilment
      break;

    case 'charge.captured':
      console.log(`Charge captured: ${data.id}`);
      // TODO: confirm the sale
      break;

    case 'dispute.created':
      console.log(`Dispute created: ${data.id}`);
      // TODO: gather evidence
      break;

    case 'customer.created':
      console.log(`Customer created: ${data.id}`);
      // TODO: sync the customer record
      break;

    case 'customer.updated':
      console.log(`Customer updated: ${data.id}`);
      // TODO: sync the customer record
      break;

    case 'customer.deleted':
      console.log(`Customer deleted: ${data.id}`);
      // TODO: remove the customer record
      break;

    case 'subscription.created':
      console.log(`Subscription created: ${data.id}`);
      // TODO: activate access
      break;

    case 'subscription.renewed':
      console.log(`Subscription renewed: ${data.id}`);
      // TODO: extend access
      break;

    case 'subscription.canceled':
      console.log(`Subscription canceled: ${data.id}`);
      // TODO: schedule revocation
      break;

    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${data.id}`);
      // TODO: reconcile the payout
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/payjp', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPayjpRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-Payjp-Webhook-Token' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)
      || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') {
    return res.status(400).json({ error: 'Expected a PAY.JP event object' });
  }

  // PAY.JP can deliver the same event more than once: dedupe on the event id.
  if (event.id && seenEvents.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling PAY.JP event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.id) seenEvents.add(event.id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPayjpRequest = verifyPayjpRequest;
module.exports.seenEvents = seenEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/payjp`);
  });
}
