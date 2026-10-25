// Generated with: appstle-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.APPSTLE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('APPSTLE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Appstle (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window. Retries and
    // replays keep the original timestamp, so see references/verification.md for
    // a manual verifier with no window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Appstle webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope: { "type": "subscription.created", "data": { ... } }
  const type = event?.type;
  const data = event?.data ?? {};
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Appstle webhook ${svixId}: ${type}`);

  switch (type) {
    case 'subscription.created':
      console.log('Subscription created:', data.id, data.customer?.email);
      break;
    case 'subscription.updated':
      console.log('Subscription updated:', data.id);
      break;
    case 'subscription.activated':
      console.log('Subscription activated:', data.id);
      break;
    case 'subscription.paused':
      console.log('Subscription paused:', data.id);
      break;
    case 'subscription.cancelled':
      console.log('Subscription cancelled:', data.id);
      break;
    case 'subscription.next-order-date-changed':
      console.log('Next order date changed:', data.id, data.nextBillingDate);
      break;
    case 'subscription.billing-interval-changed':
      console.log('Billing interval changed:', data.id, data.billingPolicy);
      break;
    case 'subscription.billing-success':
      console.log('Billing succeeded for contract', data.contractId, 'order', data.orderName);
      break;
    case 'subscription.billing-failure':
      console.log('Billing failed for contract', data.contractId, data.billingAttemptResponseMessage);
      break;
    case 'subscription.billing-skipped':
      console.log('Billing skipped for contract', data.contractId);
      break;
    case 'subscription.upcoming-order-notification':
      console.log('Upcoming order notification for contract', data.contractId);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
