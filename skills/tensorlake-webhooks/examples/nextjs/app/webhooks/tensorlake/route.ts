// Generated with: tensorlake-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.TENSORLAKE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TENSORLAKE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Tensorlake (Svix) signed
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
    console.error('Tensorlake webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `event_type`; the payload is under `data`.
  // The envelope also has event_id (evt_..., stable across retries: deduplicate on it), event_version,
  // occurred_at, project_id, source_id, source_revision and source_ordinal.
  const type: string = event.event_type;
  const data: Record<string, any> = event.data ?? {};
  console.log(`Received Tensorlake webhook ${event.event_id ?? id}: ${type}`);
  // Delivery is at-least-once and unordered: dedupe on event_id, and order related events from the same
  // source_id by Number(source_revision) then source_ordinal.

  switch (type) {
    case 'tensorlake.sandbox.created':
    case 'tensorlake.sandbox.running':
    case 'tensorlake.sandbox.suspended':
    case 'tensorlake.sandbox.resumed':
    case 'tensorlake.sandbox.terminated':
      console.log(`Sandbox ${type.split('.')[2]}:`, data.sandbox?.id, data.previous_status, '->', data.sandbox?.status);
      break;
    case 'tensorlake.sandbox.failed':
      console.log('Sandbox failed:', data.sandbox?.id, data.sandbox?.outcome_reason);
      break;
    case 'tensorlake.application.created':
    case 'tensorlake.application.updated':
    case 'tensorlake.application.deleted':
      console.log(`Application ${type.split('.')[2]}:`, data.application?.name, data.application?.version);
      break;
    case 'tensorlake.application.request.created':
    case 'tensorlake.application.request.completed':
      console.log(`Application request ${type.split('.')[3]}:`, data.application?.name, data.request?.id);
      break;
    case 'tensorlake.application.request.failed':
      console.log('Application request failed:', data.application?.name, data.request?.id, data.request?.failure_reason);
      break;
    default:
      // Return 2xx for events you don't handle, or Tensorlake keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
