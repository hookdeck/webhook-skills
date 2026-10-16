// Generated with: fanvue-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const TOLERANCE_SECONDS = 300;
const PROBE_TYPE = 'fanvue.webhook.verification';

/**
 * Parse X-Fanvue-Signature: "t=<unix seconds>,v0=<hex>" or, during a
 * signing-secret rotation, "t=<unix seconds>,v0=<old hex>,<new hex>".
 *
 * The parser is stateful on purpose: a field without "=" continues the list of
 * the previous key, which is how the rotation MAC joins `v0`. A keyed
 * split('=') parse would silently drop it.
 */
function parseSignatureHeader(header) {
  let key;
  let timestamp;
  let timestampCount = 0;
  const macs = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator !== -1) key = field.slice(0, separator).trim();
    // With separator === -1 this is the whole bare field.
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v0' && value) {
      macs.push(value.toLowerCase());
    }
  }

  return { timestamp, timestampCount, macs };
}

/**
 * Verify a Fanvue webhook signature.
 *
 * Signed content: `${t}.${rawBody}` (raw bytes, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing secret as given, hex digest
 */
function verifyFanvueSignature(
  rawBody,
  header,
  secret,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!header) {
    return { valid: false, error: 'Missing X-Fanvue-Signature header' };
  }

  const { timestamp, timestampCount, macs } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !/^[0-9]+$/.test(timestamp) || macs.length === 0) {
    return { valid: false, error: 'Malformed X-Fanvue-Signature header' };
  }

  // `t` is inside the signed content, so it can't be refreshed on a replay.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Accept when ANY MAC matches (two MACs are sent during secret rotation).
  const matched = macs.some(
    (mac) =>
      mac.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

/**
 * Deduplication key. Envelope events carry `id`; legacy flat events carry
 * `eventId`. Two documented exceptions need the timestamp folded in.
 */
function idempotencyKey(event) {
  if (typeof event.type === 'string') {
    // app.subscription.* ids hash subscription id + topic, so a repeated
    // transition reuses the earlier id.
    if (event.type.startsWith('app.subscription.')) {
      return `${event.id}:${event.timestamp}`;
    }
    return event.id;
  }
  // Legacy message.read reuses one eventId for every receipt in a conversation.
  if ('readMessagesCount' in event) {
    return `${event.eventId}:${event.timestamp}`;
  }
  return event.id ?? event.eventId;
}

function handleEnvelopeEvent(event) {
  const data = event.data || {};

  switch (event.type) {
    // Creator family (creator.*)
    case 'creator.payment.succeeded':
      // Money is in minor units; renewals arrive here with source "subscription".
      console.log(`Payment ${data.id}: ${data.gross} ${data.currency} (source: ${data.source}, ${data.billing_reason})`);
      break;
    case 'creator.reward.created':
    case 'creator.reward.reversed':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.subscription.activated':
    case 'creator.subscription.renewed':
    case 'creator.subscription.deactivated':
    case 'creator.subscription.cancel_at_period_end_changed':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.experience_subscription.activated':
    case 'creator.experience_subscription.deactivated':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.message.received':
    case 'creator.message.sent':
    case 'creator.message.deleted':
    case 'creator.message.reaction':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.message.mass_sent':
      // Broadcasts arrive here and never on creator.message.sent.
      console.log('Mass message sent:', data.id);
      break;
    case 'creator.message.read':
    case 'creator.message.read_by_fan':
      console.log(`${event.type}:`, data.object);
      break;
    case 'creator.chat.marked_unread':
      // Conversation state, not message state: don't revert read ticks.
      console.log('Chat marked unread:', data.object);
      break;
    case 'creator.follow.created':
      // data.id is always null; identity is the (follower, creator) pair.
      console.log(`New follower ${data.follower?.handle} for creator ${data.creator?.uuid}`);
      break;
    case 'creator.post.liked':
    case 'creator.post.commented':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.refund.created':
    case 'creator.dispute.flagged':
    case 'creator.dispute.created':
      console.log(`${event.type}:`, data.id);
      break;
    case 'creator.fan.status_changed':
    case 'creator.fan.presence_changed':
      console.log(`${event.type}:`, data.object);
      break;

    // Checkout family (checkout_link.*, payout.*)
    case 'checkout_link.payment.pending':
    case 'checkout_link.payment.succeeded':
    case 'checkout_link.payment.failed':
      console.log(`${event.type}:`, data.id, data.client_reference_id);
      break;
    case 'checkout_link.subscription.activated':
    case 'checkout_link.subscription.deactivated':
    case 'checkout_link.subscription.cancel_at_period_end_changed':
      console.log(`${event.type}:`, data.id);
      break;
    case 'checkout_link.refund.created':
    case 'checkout_link.refund.requested':
    case 'checkout_link.dispute.flagged':
    case 'checkout_link.dispute.created':
      console.log(`${event.type}:`, data.id);
      break;
    case 'checkout_link.installment.paid':
    case 'checkout_link.installment.failed':
    case 'checkout_link.plan.completed':
      console.log(`${event.type}:`, data.id);
      break;
    case 'payout.paid':
    case 'payout.failed':
      console.log(`${event.type}:`, data.id);
      break;

    // App family (app.*): your app's own sales and experience actions
    case 'app.payment.pending':
    case 'app.payment.succeeded':
    case 'app.payment.failed':
      console.log(`${event.type}:`, data.id);
      break;
    case 'app.subscription.activated':
    case 'app.subscription.cancel_at_period_end_changed':
      // Read live state from GET /apps/{appUuid}/subscription-status.
      console.log(`${event.type}:`, data.id);
      break;
    case 'app.refund.created':
    case 'app.payment.refunded': // deprecated alias of app.refund.created
    case 'app.dispute.flagged':
    case 'app.dispute.created':
      console.log(`${event.type}:`, data.id);
      break;
    case 'app.experience.action.payment.pending':
    case 'app.experience.action.payment.succeeded':
    case 'app.experience.action.payment.failed':
    case 'app.experience.action.refund.created':
    case 'app.experience.action.dispute.flagged':
    case 'app.experience.action.dispute.created':
      console.log(`${event.type}:`, data.id);
      break;

    default:
      // Answer 2xx for unknown types: a 4xx counts as a failure and walks the
      // endpoint towards auto-disable.
      console.log(`Unhandled Fanvue event type: ${event.type}`);
  }
}

function handleLegacyEvent(event) {
  // Legacy flat events (follow.new, purchase.new, tip.new, subscription.*,
  // message.received, message.read) are deprecated and their body never names
  // the topic. Migrate to the creator.* replacement rather than branching on
  // field presence; subscribing to both counts every occurrence twice.
  console.log('Legacy Fanvue event for creator', event.recipientUuid);
}

// Fanvue webhook endpoint. express.raw keeps the exact bytes Fanvue signed.
app.post('/webhooks/fanvue', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  let event = null;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    event = null;
  }

  // 1. Verification probe. POST /webhooks/subscriptions sends one UNSIGNED
  //    {"type":"fanvue.webhook.verification"} body and fails unless it gets a
  //    2xx. Answer it before checking signatures; it carries no event data, so
  //    nothing is processed on this path.
  if (event && event.type === PROBE_TYPE) {
    return res.status(200).json({ ok: true });
  }

  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FANVUE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // 2. Every other request must carry a valid X-Fanvue-Signature.
  const verification = verifyFanvueSignature(rawBody, req.get('x-fanvue-signature'), secret);
  if (!verification.valid) {
    console.error('Fanvue webhook verification failed:', verification.error);
    return res.status(401).json({ error: verification.error });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // 3. Route on the signed body, never on the unauthenticated X-Fanvue-Topic header.
  //    In production: persist the event under this key, return 2xx, process async.
  const key = idempotencyKey(event);
  console.log('Fanvue event', key);

  if (typeof event.type === 'string' && event.data) {
    handleEnvelopeEvent(event);
  } else {
    handleLegacyEvent(event);
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFanvueSignature = verifyFanvueSignature;
module.exports.parseSignatureHeader = parseSignatureHeader;
module.exports.idempotencyKey = idempotencyKey;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fanvue`);
  });
}
