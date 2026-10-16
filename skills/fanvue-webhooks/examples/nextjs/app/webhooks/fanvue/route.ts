// Generated with: fanvue-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  PROBE_TYPE,
  verifyFanvueSignature,
  idempotencyKey,
  isEnvelopeEvent,
  type FanvueEnvelopeEvent,
  type FanvueEvent,
  type FanvueLegacyEvent,
} from '../../../lib/fanvue-signature';

function handleEnvelopeEvent(event: FanvueEnvelopeEvent) {
  const data = event.data as Record<string, any>;

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

function handleLegacyEvent(event: FanvueLegacyEvent) {
  // Legacy flat events (follow.new, purchase.new, tip.new, subscription.*,
  // message.received, message.read) are deprecated and their body never names
  // the topic. Migrate to the creator.* replacement rather than branching on
  // field presence; subscribing to both counts every occurrence twice.
  console.log('Legacy Fanvue event for creator', event.recipientUuid);
}

export async function POST(request: NextRequest) {
  // Route handlers don't pre-parse the body: text() gives the bytes Fanvue
  // signed. Never verify against JSON.stringify(await request.json()).
  const rawBody = await request.text();

  let event: FanvueEvent | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    event = null;
  }

  // 1. Verification probe. POST /webhooks/subscriptions sends one UNSIGNED
  //    {"type":"fanvue.webhook.verification"} body and fails unless it gets a
  //    2xx. Answer it before checking signatures; it carries no event data, so
  //    nothing is processed on this path.
  if (event && event.type === PROBE_TYPE) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FANVUE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // 2. Every other request must carry a valid X-Fanvue-Signature.
  const verification = verifyFanvueSignature(
    rawBody,
    request.headers.get('x-fanvue-signature'),
    secret
  );
  if (!verification.valid) {
    console.error('Fanvue webhook verification failed:', verification.error);
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // 3. Route on the signed body, never on the unauthenticated X-Fanvue-Topic header.
  //    In production: persist the event under this key, return 2xx, process async.
  const key = idempotencyKey(event);
  console.log('Fanvue event', key);

  if (isEnvelopeEvent(event)) {
    handleEnvelopeEvent(event);
  } else {
    handleLegacyEvent(event);
  }

  return NextResponse.json({ received: true });
}
