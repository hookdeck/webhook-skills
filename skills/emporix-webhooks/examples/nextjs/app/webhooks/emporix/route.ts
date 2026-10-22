// Generated with: emporix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getEventType } from '../../../lib/emporix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.EMPORIX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('EMPORIX_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body (any content type): verification needs the exact bytes Svix signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Emporix webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = getEventType(body, new URL(request.url).searchParams);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Emporix webhook ${svixId}: ${eventType ?? '(unknown event type)'}`);

  switch (eventType) {
    case 'order.created':
      console.log('Order created:', body.id, body.status);
      break;
    case 'order.updated':
      console.log('Order updated:', body.id, body.status);
      break;
    case 'customer.created':
      console.log('Customer created:', body.customerNumber, body.contactEmail);
      break;
    case 'product.created':
      console.log('Product created:', body.id, body.code);
      break;
    case 'product.updated':
      console.log('Product updated:', body.id, body.code);
      break;
    case null:
      // No event type available: register one Svix endpoint per event with ?eventType=...
      console.log('Event type unknown; payload keys:', Object.keys(body ?? {}));
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  return NextResponse.json({ success: true, eventType });
}
