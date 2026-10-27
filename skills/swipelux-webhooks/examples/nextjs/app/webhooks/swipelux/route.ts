// Generated with: swipelux-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SWIPELUX_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SWIPELUX_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Swipelux (Svix) signed
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
    console.error('Swipelux webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // v3 envelope: { id, type, createdAt, attempt, resource: { type, id }, data: { object, previous } }
  // `id` is the event id: deduplicate on it. `attempt` is NOT a dedupe key or retry counter.
  const type: string = event.type;
  const resource: Record<string, any> = event.resource ?? {};
  const object: Record<string, any> = event.data?.object ?? {};
  console.log(`Received Swipelux webhook ${event.id}: ${type} (${resource.type} ${resource.id})`);

  // Delivery is at least once and may be reordered: persist event.id, return 2xx, then refetch
  // the current resource from the API (e.g. GET /v3/transfers/{id}) before acting on it.
  switch (type) {
    case 'customer.created':
    case 'customer.updated':
    case 'customer.archived':
      console.log(`Customer ${type.split('.')[1]}:`, resource.id);
      break;
    case 'capability.created':
    case 'capability.status_changed':
      console.log(`Capability ${type.split('.')[1]}:`, resource.id, object.status);
      break;
    case 'application.status_changed':
      console.log('Application status changed:', resource.id, object.status);
      break;
    case 'recipient.status_changed':
      console.log('Recipient status changed:', resource.id, object.status);
      break;
    case 'destination.status_changed':
      console.log('Destination status changed:', resource.id, object.status);
      break;
    case 'account.created':
    case 'account.status_changed':
    case 'account.details_changed':
      console.log(`Account ${type.split('.')[1]}:`, resource.id, object.status);
      break;
    case 'transfer.state_changed':
      // data.previous.state is the prior state (transfer: awaiting_funds, processing, action_required,
      // completed, failed, canceled)
      console.log('Transfer state changed:', resource.id, event.data?.previous?.state, '->', object.state);
      break;
    default:
      // Return 2xx for events you don't handle, or Svix keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
