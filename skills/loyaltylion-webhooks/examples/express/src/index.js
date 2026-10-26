// Generated with: loyaltylion-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// x-loyaltylion-hmac-sha256 is the bare, padded, standard-base64 HMAC-SHA256 digest (44 chars).
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify the x-loyaltylion-hmac-sha256 header.
 * Signature = base64(HMAC-SHA256(secret, rawBody)): the raw body bytes only, key = the secret's
 * UTF-8 bytes. The format is checked first (the base64 string is never decoded), then the
 * base64 strings are compared exactly, in constant time.
 */
function verifyLoyaltyLionSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The envelope is { id, topic, created_at, payload }. The docs' customers/update example puts
 * `customer` at the top level instead of under `payload`, so accept both. The
 * rewards/store_fulfilment webhook (sent to a custom reward's fulfilment URL) has no envelope
 * and no topic: its body is the flat fulfilment object.
 */
function getTopic(body) {
  if (typeof body.topic === 'string') return body.topic;
  if (body.reward_fulfilment_id !== undefined) return 'rewards/store_fulfilment';
  return undefined;
}

function getData(body) {
  return body.payload && typeof body.payload === 'object' ? body.payload : body;
}

// program_events/* payloads nest their fields under `properties`
function getCustomer(data) {
  return data.customer || (data.properties && data.properties.customer) || {};
}

function handleEvent(topic, body) {
  const data = getData(body);
  const customer = getCustomer(data);

  switch (topic) {
    case 'customers/update':
      console.log(`Customer ${customer.id} updated (${customer.points_approved} points approved)`);
      // TODO: sync the customer's points balance and tier to your system
      break;

    case 'program_events/customer.enrolled':
      console.log(`Customer ${customer.id} enrolled in the loyalty program`);
      // TODO: send a welcome message or tag the customer
      break;

    case 'program_events/customer.points_earned':
      console.log(`Customer ${customer.id} earned points`);
      // TODO: record the transaction (data.properties.transaction)
      break;

    case 'program_events/customer.tier_upgraded':
    case 'program_events/customer.tier_downgraded':
      console.log(`Customer ${customer.id} tier changed (${topic.split('.').pop()})`);
      // TODO: update tier-based perks
      break;

    case 'program_events/customer.claimed_reward':
      console.log(`Customer ${customer.id} claimed a reward`);
      // TODO: fulfil or record the reward (voucher_code, discount_amount, ...)
      break;

    case 'program_events/customer.referral_complete':
      console.log(`Referral completed for customer ${customer.id}`);
      break;

    case 'loyalty_emails/unsubscribe':
      console.log(`Customer ${data.unsubscribe && data.unsubscribe.customer && data.unsubscribe.customer.id} unsubscribed from loyalty emails`);
      // TODO: suppress loyalty emails for this customer
      break;

    case 'receipts/manual_approval_required':
      console.log(`Receipt ${data.receipt && data.receipt.id} needs manual review`);
      break;

    case 'rewards/store_fulfilment':
      // A 2xx response marks this redemption as successfully fulfilled. `test: true` is sent
      // when you create or update the custom reward, to confirm the URL works.
      console.log(`Fulfilment ${body.reward_fulfilment_id} for reward ${body.reward_identifier}${body.test ? ' (test)' : ''}`);
      // TODO: grant the custom reward to body.customer_id
      break;

    default:
      console.log(`Unhandled LoyaltyLion topic: ${topic}`);
  }
}

// Read the body raw so the exact bytes are verified, whatever Content-Type the request carries.
app.post('/webhooks/loyaltylion', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LOYALTYLION_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOYALTYLION_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyLoyaltyLionSignature(rawBody, req.get('x-loyaltylion-hmac-sha256'), secret)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
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

  // At-least-once delivery: dedupe on body.id (envelope webhooks) before doing real work.
  try {
    handleEvent(getTopic(body), body);
  } catch (err) {
    console.error('Error handling LoyaltyLion webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // LoyaltyLion needs a 200 within 5 seconds, otherwise the delivery counts as failed
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLoyaltyLionSignature = verifyLoyaltyLionSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/loyaltylion`);
  });
}
