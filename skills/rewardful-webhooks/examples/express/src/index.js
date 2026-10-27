// Generated with: rewardful-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Rewardful signs the raw body: X-Rewardful-Signature = lowercase hex HMAC-SHA256 of the
 * request body, keyed with the endpoint's Signing Secret (used as UTF-8 bytes, no prefix).
 * Nothing else is signed, so there is no timestamp or replay window to check.
 */
function verifyRewardfulSignature(rawBody, signature, secret = process.env.REWARDFUL_WEBHOOK_SECRET) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex')); // both 32 bytes
}

// In-memory dedupe for the example; use a durable store (Redis, database) in production.
const seenEvents = new Set();

function handleEvent(payload) {
  const type = payload.event && payload.event.type;
  const object = payload.object || {};

  switch (type) {
    case 'affiliate.created':
      console.log(`Affiliate created: ${object.email} (${object.id})`);
      // TODO: create a CRM contact
      break;

    case 'affiliate.confirmed':
      console.log(`Affiliate confirmed: ${object.email} (${object.id})`);
      // TODO: send onboarding
      break;

    case 'referral.lead':
      console.log(`Referral became a lead: ${object.id}`);
      // TODO: track the funnel
      break;

    case 'referral.converted':
      console.log(`Referral converted: ${object.id}`);
      // TODO: attribute revenue to the affiliate
      break;

    case 'sale.created':
      console.log(`Sale created: ${object.id}`);
      // TODO: record the sale
      break;

    case 'sale.refunded':
      console.log(`Sale refunded: ${object.id}`);
      // TODO: reverse attribution
      break;

    case 'commission.created':
      console.log(`Commission created: ${object.id}`);
      // TODO: record the liability
      break;

    case 'commission.paid':
      console.log(`Commission paid: ${object.id}`);
      // TODO: notify the affiliate
      break;

    case 'payout.due':
      console.log(`Payout due: ${object.id}`);
      // TODO: queue finance work
      break;

    case 'payout.paid':
      console.log(`Payout paid: ${object.id}`);
      // TODO: mark as settled
      break;

    case 'payout.failed':
      console.log(`Payout failed: ${object.id}`);
      // TODO: alert finance
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.post('/webhooks/rewardful', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-rewardful-signature'];

  if (!verifyRewardfulSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  // Retries redeliver the same event; acknowledge repeats without reprocessing.
  const eventId = payload.event && payload.event.id;
  if (eventId && seenEvents.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Rewardful event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (eventId) seenEvents.add(eventId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRewardfulSignature = verifyRewardfulSignature;
module.exports.seenEvents = seenEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rewardful`);
  });
}
