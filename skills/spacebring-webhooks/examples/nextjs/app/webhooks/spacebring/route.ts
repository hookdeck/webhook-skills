// Generated with: spacebring-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Most bodies hold the changed object under a resource-named key beside `type`.
// subscription.* bodies are the bare subscription object and visitors.* bodies carry `visit` only.
const RESOURCE_KEYS = ['booking', 'company', 'event', 'ticket', 'membership', 'order', 'application', 'visit'];

function resourceId(event: Record<string, any>) {
  const key = RESOURCE_KEYS.find((k) => event[k] && typeof event[k] === 'object');
  return key ? event[key].id : event.id;
}

export async function POST(request: Request) {
  const secret = process.env.SPACEBRING_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SPACEBRING_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Spacebring (Svix) signed
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
    console.error('Spacebring webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Svix's headers carry no event type. Most bodies have a top-level `type`, but the docs never
  // show its value, so log what arrives and fall back gracefully when it is missing.
  const type: string | null = typeof event.type === 'string' ? event.type : null;
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Spacebring webhook ${id}: ${type ?? '(no type field)'}`);

  switch (type) {
    case 'booking.created':
    case 'booking.updated':
    case 'booking.deleted':
    case 'booking.paid':
      console.log(`Booking ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'company.created':
    case 'company.deleted':
      console.log(`Company ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'membership.created':
    case 'membership.invited':
      console.log(`Membership ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'event.created':
    case 'event.updated':
    case 'event.deleted':
    case 'event.canceled':
      console.log(`Event ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'event.ticket.created':
    case 'event.ticket.paid':
      console.log(`Event ticket ${type.split('.')[2]}:`, resourceId(event));
      break;
    case 'shop.order.created':
    case 'shop.order.paid':
      console.log(`Shop order ${type.split('.')[2]}:`, resourceId(event));
      break;
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.deleted':
    case 'subscription.purchased':
      // The body is the bare subscription object
      console.log(`Subscription ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'support.ticket.created':
      console.log('Support ticket created:', resourceId(event));
      break;
    case 'benefit.application.created':
      console.log('Benefit application created:', resourceId(event));
      break;
    case 'invoice.issued':
      // No body schema is documented for this event
      console.log('Invoice issued:', resourceId(event));
      break;
    case 'location.created':
    case 'location.updated':
    case 'location.deleted':
    case 'resource.created':
    case 'resource.updated':
    case 'resource.deleted':
      // No body schema is documented for location.* or resource.* events
      console.log(`${type.split('.')[0]} ${type.split('.')[1]}:`, resourceId(event));
      break;
    case 'visitors.request.approved':
    case 'visitors.visit.checked_in':
    case 'visitors.visit.checked_out':
      // The body carries `visit` only
      console.log(`Visitors ${type.split('.').slice(1).join(' ')}:`, event.visit?.id);
      break;
    default:
      // Return 200 for events you don't handle, or Spacebring keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
