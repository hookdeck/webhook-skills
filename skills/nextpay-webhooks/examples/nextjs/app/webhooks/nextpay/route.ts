// Generated with: nextpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.NEXTPAY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NEXTPAY_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes NextPay (Svix) signed
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
    console.error('NextPay webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Two body shapes: v2.* payment events are {event, payload}; payout and platform events are {type, data}
  // (NextPay's own guide reads `event.event || event.type`)
  const type: string | undefined = event.event || event.type;
  const object: Record<string, any> = event.payload ?? event.data ?? {};
  // `svix-id` is stable across retries and replays: use it (or the event's `id`) to deduplicate.
  // Ordering is not documented, so judge state by the resource's `status`, not by arrival order.
  console.log(`Received NextPay webhook ${id}: ${type}`);

  switch (type) {
    case 'v2.payment_intent.succeeded':
      // Payment received and settled: fulfil the order via payload.external_id
      console.log('Payment intent succeeded:', object.id, object.external_id, object.amount);
      break;
    case 'v2.payment_intent.canceled':
      console.log('Payment intent canceled:', object.id, object.external_id);
      break;
    case 'v2.payment_instrument.used':
      // A single-use Funding Method instrument was used
      console.log('Payment instrument used:', object.id);
      break;
    case 'v2.payment_instrument.payment_received':
      // Incoming payment received on a Funding Method, not yet cleared
      console.log('Payment received:', object.id, object.amount);
      break;
    case 'v2.payment_instrument.payment_settled':
      console.log('Payment settled:', object.id, object.amount);
      break;
    case 'payout_request.creation_failed':
    case 'payout_request.queue_failed':
      console.log('Payout request failed:', type, object.id);
      break;
    case 'payout_request.queued':
      console.log('Payout request queued:', object.id);
      break;
    case 'payout_request.processed':
      console.log('Payout request processed:', object.id, object.status);
      break;
    case 'payout.succeeded':
    case 'payout.processed':
      console.log('Payout delivered:', type, object.id, object.amount_cents);
      break;
    case 'payout.failed':
    case 'payout.processing_failed':
      console.log('Payout failed:', type, object.id);
      break;
    case 'deposit.confirmed':
      console.log('Deposit confirmed:', object.id);
      break;
    case 'direct_transfer.received':
      console.log('Direct transfer received:', object.id);
      break;
    case 'legal_entity.verification_status_changed':
      // Merchant KYC/compliance status changed
      console.log('Verification status changed:', object.id, object.status);
      break;
    default:
      // Return 2xx for events you don't handle; 4xx is not retried but 5xx is
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
