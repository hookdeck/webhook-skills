// Generated with: superwall-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SUPERWALL_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SUPERWALL_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Superwall (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Superwall webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level lowercase `type` in both formats. V2 puts the store facts in
  // `event_data` (snake_case) and the event id in `id`; legacy puts them in `data` (camelCase) with
  // the id in `data.id`. The `superwall_version` header is 2 for V2 and 1 for legacy.
  const legacy = request.headers.get('superwall_version') === '1' || (!event.event_data && event.object === 'event');
  const type: string = event.type;
  const facts: Record<string, any> = (legacy ? event.data : event.event_data) ?? {};
  const eventId = legacy ? facts.id : event.id;
  const periodType = legacy ? facts.periodType : facts.period_type;
  const productId = legacy ? facts.productId : facts.product_id;
  // `evt_...` ids (V2) are stable across redelivery: use them to deduplicate. Deliveries are
  // at least once and unordered, so order by `occurred_at` (V2) rather than by arrival.
  console.log(`Received Superwall webhook ${eventId} (${legacy ? 'legacy' : 'V2'}): ${type}`);

  switch (type) {
    case 'initial_purchase':
      console.log(periodType === 'TRIAL' ? 'Trial started:' : 'Subscription started:', productId, event.app_user_id);
      break;
    case 'renewal':
      console.log('Renewal:', productId, 'trial conversion:', legacy ? facts.isTrialConversion : facts.is_trial_conversion);
      break;
    case 'non_renewing_purchase':
      console.log('One-time purchase:', productId, facts.price);
      break;
    case 'product_change':
      console.log('Product change:', productId, '->', legacy ? facts.newProductId : facts.new_product_id);
      break;
    case 'cancellation':
      // Auto-renew turned off; access continues until expiry. Legacy refunds arrive as a
      // cancellation with isRefund true; V2 sends a separate `refund` event.
      console.log('Cancellation:', productId, legacy ? facts.cancelReason : facts.cancel_reason);
      break;
    case 'uncancellation':
      console.log('Auto-renew turned back on:', productId);
      break;
    case 'refund':
      // price and proceeds are negative
      console.log('Refund:', productId, facts.price, facts.proceeds);
      break;
    case 'billing_issue':
      console.log('Billing issue, subscription at risk:', productId);
      break;
    case 'subscription_paused':
      console.log('Subscription paused (Google Play):', productId);
      break;
    case 'subscription_extended':
      console.log('Subscription extended by the store:', productId, legacy ? facts.expirationAt : facts.expiration_at);
      break;
    case 'expiration':
      console.log('Subscription expired:', productId, legacy ? facts.expirationReason : facts.expiration_reason);
      break;
    case 'transferred':
      // Reserved for ownership changes; documented as not sent yet
      console.log('Subscription transferred:', productId);
      break;
    default:
      // Return 2xx for events you don't handle, or Superwall keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
