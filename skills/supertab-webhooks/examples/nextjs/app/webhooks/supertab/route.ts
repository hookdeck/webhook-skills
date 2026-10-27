// Generated with: supertab-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SUPERTAB_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SUPERTAB_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Supertab (Svix) signed
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
    console.error('Supertab webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `type`, the payload is under `data`. The name carries a version
  // suffix (`purchase.completed_2025-04-01`), but the catalog's own purchase.completed example
  // omits it, so strip the suffix and switch on the base name. There is no event id in the body.
  const rawType: string | undefined = event.type;
  const type = typeof rawType === 'string' ? rawType.replace(/_\d{4}-\d{2}-\d{2}$/, '') : undefined;
  const data: Record<string, any> = event.data ?? {};
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Supertab webhook ${id}: ${rawType}`);

  switch (type) {
    case 'purchase.completed':
      // data: id, offering_id, description, price, user, metadata, entitlement_status, purchased_at, completed_at
      console.log('Purchase completed:', data.id, data.offering_id, data.user?.email, data.price?.amount, data.price?.currency?.code);
      break;
    case 'onetime_offering.purchasing_completed':
      // data: id, status, metadata, price, items[] (each item has its own metadata and purchase)
      // Check `metadata` here before granting access to what the offering represents
      console.log('One-Time Offering purchased:', data.id, data.status, data.items?.length, data.metadata);
      break;
    default:
      // Return 2xx for events you don't handle, or Supertab keeps retrying them
      console.log('Unhandled event type:', rawType);
  }

  return NextResponse.json({ success: true, type: rawType });
}
