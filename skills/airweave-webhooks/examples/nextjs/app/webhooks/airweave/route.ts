// Generated with: airweave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.AIRWEAVE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('AIRWEAVE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Airweave (Svix) signed
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
    console.error('Airweave webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Flat body: the event name is the top-level `event_type`, and the ids sit beside it.
  // The body has no event id: deduplicate on the svix-id header, which is stable across retries.
  // Deliveries are not ordered, so don't let a late sync.running overwrite a sync.completed.
  const type: string = event.event_type;
  console.log(`Received Airweave webhook ${id}: ${type}`);

  switch (type) {
    case 'sync.pending':
      // A sync job was created and queued
      console.log('Sync queued:', event.collection_readable_id, event.source_type, event.sync_job_id);
      break;
    case 'sync.running':
      console.log('Sync running:', event.collection_readable_id, event.source_type, event.sync_job_id);
      break;
    case 'sync.completed':
      // Entity and chunk counts are present on this event only
      console.log('Sync completed:', event.collection_name, `${event.entities_inserted ?? 0} inserted, ${event.entities_updated ?? 0} updated, ${event.entities_deleted ?? 0} deleted`);
      break;
    case 'sync.failed':
      // `error` carries the reason (for example an expired auth token)
      console.log('Sync failed:', event.collection_name, event.error ?? 'Unknown error');
      break;
    case 'sync.cancelled':
      console.log('Sync cancelled:', event.collection_readable_id, event.sync_job_id);
      break;
    case 'source_connection.created':
      // The connection may not be authenticated yet (OAuth not finished): check is_authenticated
      console.log('Source connection created:', event.source_type, event.source_connection_id, event.is_authenticated);
      break;
    case 'source_connection.auth_completed':
      console.log('Source connection authenticated:', event.source_type, event.source_connection_id);
      break;
    case 'source_connection.deleted':
      console.log('Source connection deleted:', event.source_type, event.source_connection_id);
      break;
    case 'collection.created':
      console.log('Collection created:', event.collection_readable_id, event.collection_name);
      break;
    case 'collection.updated':
      console.log('Collection updated:', event.collection_readable_id, event.collection_name);
      break;
    case 'collection.deleted':
      console.log('Collection deleted:', event.collection_readable_id);
      break;
    default:
      // Return 200 for events you don't handle, or Airweave keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
