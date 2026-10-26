// Generated with: terminal-telematics-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.TERMINAL_TELEMATICS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TERMINAL_TELEMATICS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    // Deliveries from Terminal always carry svix-* (or webhook-*) signature headers
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Terminal (via Svix) signed
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
    console.error('Terminal webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `type`; the related entities sit under `detail`
  const type: string | undefined = typeof event?.type === 'string' ? event.type : undefined;
  const detail = event?.detail ?? {};
  const action = type?.split('.')[1];
  // The delivery id (svix-id) is stable across retries: use it to deduplicate
  console.log(`Received Terminal webhook ${id}: ${type} (${event?.id})`);

  switch (type) {
    case 'connection.created':
    case 'connection.completed':
    case 'connection.reconnected':
    case 'connection.updated':
      console.log(`Connection ${action}:`, detail.connection?.id, detail.connection?.provider?.code);
      break;
    case 'connection.disconnected':
      // Credentials stopped working: the user has to re-authenticate through Link
      console.log('Connection disconnected:', detail.connection?.id);
      break;
    case 'connection.pending_deletion':
    case 'connection.deleted':
      console.log(`Connection ${action}:`, detail.connection?.id);
      break;
    case 'sync.requested':
    case 'sync.started':
      console.log(`Sync ${action}:`, detail.sync?.id, 'connection', detail.connection?.id);
      break;
    case 'sync.completed':
    case 'connection.first_sync_completed':
      // Data is ready to read. For S3/data deliveries wait for delivery.completed instead
      console.log(`${type}:`, detail.sync?.id, 'connection', detail.connection?.id);
      break;
    case 'sync.failed':
      console.log('Sync failed:', detail.sync?.id, detail.sync?.failureReason);
      break;
    case 'delivery.requested':
    case 'delivery.started':
    case 'delivery.completed':
    case 'delivery.failed':
      console.log(`Delivery ${action}:`, detail.delivery?.id, 'destination', detail.destination?.id);
      break;
    case 'issue.reported':
    case 'issue.resolved':
      console.log(`Issue ${action}:`, detail.issue?.id, detail.issue?.status, 'connection', detail.connection?.id);
      break;
    case 'provider.availability_updated':
      // Not tied to a connection: every subscribed application receives it for every provider
      console.log('Provider availability updated:', detail.provider?.code, detail.availability?.current);
      break;
    case 'unsupported_provider.requested':
      console.log('Unsupported provider requested:', detail.provider);
      break;
    case 'vehicle.added':
    case 'vehicle.modified':
    case 'vehicle.removed':
      console.log(`Vehicle ${action}:`, detail.vehicle?.id, 'connection', detail.connection?.id);
      break;
    case 'driver.added':
    case 'driver.modified':
    case 'driver.removed':
      console.log(`Driver ${action}:`, detail.driver?.id, 'connection', detail.connection?.id);
      break;
    case 'trailer.added':
    case 'trailer.modified':
    case 'trailer.removed':
      console.log(`Trailer ${action}:`, detail.trailer?.id, 'connection', detail.connection?.id);
      break;
    case 'safety_event.added':
    case 'safety_event.modified':
      console.log(`Safety event ${action}:`, detail.safetyEvent?.id, 'connection', detail.connection?.id);
      break;
    case 'link.analytics_event_emitted':
      // Link flow telemetry; most apps ignore it
      break;
    default:
      // Return 200 for events you don't handle, or Terminal keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
