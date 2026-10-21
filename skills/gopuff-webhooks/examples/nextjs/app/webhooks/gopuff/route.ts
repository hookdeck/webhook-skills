// Generated with: gopuff-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Gopuff payloads carry no event-type field, so classify them by shape.
// order.status / order.status.v2 / order.delivered -> { order: {...} }
// Delivery Status -> { driver: {...} }; Delivery ETA -> { expected_delivery_time: {...} }
function classify(event: any): string {
  if (event?.order && typeof event.order === 'object') return 'order';
  if (event?.driver) return 'delivery_status';
  if (event?.expected_delivery_time) return 'delivery_eta';
  return 'unknown';
}

export async function POST(request: Request) {
  const secret = process.env.GOPUFF_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Svix sends svix-* headers; white-labeled accounts use webhook-*.
  const id = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const timestamp = request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const signature = request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body. Do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // Signed content is `${id}.${timestamp}.${rawBody}`; the SDK checks every
    // v1 signature in constant time and enforces a 5-minute timestamp tolerance.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // svix-id is stable across retries: use it as the idempotency key.
  const kind = classify(event);
  switch (kind) {
    case 'order': {
      const { id: orderId, partner_order_id: partnerOrderId, status, cancel_reason: reason } = event.order;
      console.log('Order status (order.status.v2):', { orderId, partnerOrderId, status });
      if (status === 'Finished') console.log('Order delivered (order.delivered):', partnerOrderId);
      if (status === 'Cancelled') console.log('Order cancelled:', reason);
      break;
    }
    case 'delivery_status':
      console.log('Driver location:', event.driver?.location);
      break;
    case 'delivery_eta':
      console.log('Delivery ETA:', event.expected_delivery_time);
      break;
    default:
      console.log('Unhandled Gopuff payload');
  }

  return NextResponse.json({ success: true, kind, svixId: id }, { status: 200 });
}
