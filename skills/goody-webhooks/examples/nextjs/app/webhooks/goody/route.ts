// Generated with: goody-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.GOODY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('GOODY_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Goody (Svix) signed
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
    console.error('Goody webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `event_type`; the order (or order batch) is under `data`
  const type: string = event.event_type;
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Goody webhook ${id}: ${type}`);

  switch (type) {
    case 'order_batch.created':
    case 'gift_batch.created': // the docs' example payload still shows the older gift_batch.* name
      console.log('Order batch created:', event.data?.id, event.data?.send_status);
      break;
    case 'order_batch.completed':
    case 'gift_batch.completed':
      console.log('Order batch completed:', event.data?.id);
      break;
    case 'order.created':
      // individual_gift_link is the link to send to the recipient
      console.log('Order created:', event.data?.id, event.data?.individual_gift_link);
      break;
    case 'order.gift_opened':
      console.log('Gift opened:', event.data?.id);
      break;
    case 'order.gift_accepted':
      // Final costs are calculated now; is_swapped and cart show what the recipient chose
      console.log('Gift accepted:', event.data?.id, event.data?.is_swapped, event.data?.amounts?.amount_total);
      break;
    case 'order.thank_you_note_added':
      console.log('Thank you note added:', event.data?.id, event.data?.thank_you_note);
      break;
    case 'order.shipped':
      // Emitted when the first shipment is in transit
      console.log('Order shipped:', event.data?.id);
      break;
    case 'order.delivered':
      // Emitted when all shipments are delivered
      console.log('Order delivered:', event.data?.id);
      break;
    case 'order.canceled':
      console.log('Order canceled:', event.data?.id);
      break;
    case 'order.refunded':
      console.log('Order refunded:', event.data?.id);
      break;
    default:
      // Return 200 for events you don't handle, or Goody keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
