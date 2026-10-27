// Generated with: dodo-payments-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Dodo Payments sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('DODO_PAYMENTS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Dodo Payments signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Dodo Payments webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The envelope is { business_id, type, timestamp, data }; data.payload_type names the resource kind
  const type = event.type;
  const data = event.data ?? {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Dodo Payments webhook ${id}: ${type}`);

  switch (type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', data.payment_id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', data.payment_id);
      break;
    case 'payment.processing':
      console.log('Payment processing:', data.payment_id);
      break;
    case 'payment.cancelled':
      console.log('Payment cancelled:', data.payment_id);
      break;
    case 'refund.succeeded':
      console.log('Refund succeeded:', data.refund_id);
      break;
    case 'refund.failed':
      console.log('Refund failed:', data.refund_id);
      break;
    case 'dispute.opened':
      console.log('Dispute opened:', data.dispute_id);
      break;
    case 'dispute.won':
      console.log('Dispute won:', data.dispute_id);
      break;
    case 'dispute.lost':
      console.log('Dispute lost:', data.dispute_id);
      break;
    case 'subscription.active':
      console.log('Subscription active:', data.subscription_id);
      break;
    case 'subscription.renewed':
      console.log('Subscription renewed:', data.subscription_id);
      break;
    case 'subscription.on_hold':
      console.log('Subscription on hold:', data.subscription_id);
      break;
    case 'subscription.cancelled':
      console.log('Subscription cancelled:', data.subscription_id);
      break;
    case 'license_key.created':
      console.log('License key created:', data.payload_type);
      break;
    default:
      // Events can arrive out of order and the documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
