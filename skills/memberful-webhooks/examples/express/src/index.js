// Generated with: memberful-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify the X-Memberful-Webhook-Signature header: lowercase hex HMAC-SHA256 of the raw body bytes, keyed
 * with the webhook secret's UTF-8 bytes. Nothing else is signed (no timestamp, no id).
 */
function verifyMemberfulSignature(rawBody, signature, secret = process.env.MEMBERFUL_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Validate length and alphabet before decoding (Buffer.from(..., 'hex') silently drops bad characters).
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // case-insensitive, as Hookdeck does
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Parsed fields are untrusted: only use values of the expected type.
const str = (v) => (typeof v === 'string' ? v : undefined);
const idOf = (v) => (isObject(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? v.id : undefined);

// Memberful's event reference lists these names but never shows where the name travels.
// ASSUMPTION: a top-level `event` field. Confirm against a real delivery (Settings > Webhooks > test).
function handleEvent(payload) {
  const eventType = str(payload.event);

  switch (eventType) {
    case 'member_signup':
      console.log(`Member signed up: ${idOf(payload.member)}`);
      // TODO: create the member in your app
      break;

    case 'member_updated':
    case 'member.deleted':
    case 'tax_id.updated':
    case 'custom_fields.updated':
      console.log(`${eventType}: member ${idOf(payload.member)}`);
      // TODO: sync or remove the member's profile
      break;

    case 'subscription.created':
    case 'subscription.renewed':
    case 'subscription.activated':
    case 'subscription.reactivated':
      console.log(`${eventType}: subscription ${idOf(payload.subscription)}`);
      // TODO: grant or extend the member's access
      break;

    case 'subscription.updated':
      // `changed` maps field -> [old, new]; a plan_id entry means a plan change.
      console.log(`subscription.updated: subscription ${idOf(payload.subscription)}`);
      // TODO: re-fetch the subscription from the API (delivery order is not guaranteed)
      break;

    case 'subscription.deactivated':
    case 'subscription.deleted':
      console.log(`${eventType}: subscription ${idOf(payload.subscription)}`);
      // TODO: remove the member's access
      break;

    case 'order.purchased':
    case 'order.refunded':
    case 'order.suspended':
    case 'order.completed':
      console.log(`${eventType}: order ${idOf(payload.order)}`);
      // TODO: record the order or refund
      break;

    case 'subscription_plan.created':
    case 'subscription_plan.updated':
    case 'subscription_plan.deleted':
    case 'download.created':
    case 'download.updated':
    case 'download.deleted':
      console.log(`${eventType} received`);
      // TODO: sync prices (subscription_plan.*) or downloads
      break;

    default:
      console.log(`Unhandled event: ${eventType} (keys: ${Object.keys(payload).join(', ')})`);
  }
}

// Memberful sends POST only. Read the body as raw bytes (any content type) so the exact
// bytes are verified; parse after.
app.all('/webhooks/memberful', express.raw({ type: '*/*' }), (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyMemberfulSignature(rawBody, req.headers['x-memberful-webhook-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing X-Memberful-Webhook-Signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Memberful webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMemberfulSignature = verifyMemberfulSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/memberful`);
  });
}
