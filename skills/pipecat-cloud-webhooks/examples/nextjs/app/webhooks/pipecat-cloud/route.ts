// Generated with: pipecat-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.PIPECAT_CLOUD_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PIPECAT_CLOUD_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Pipecat Cloud (Svix) signed
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
    console.error('Pipecat Cloud webhook verification failed:', message);
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
  // `org` is the organization name and `created_at` an ISO 8601 UTC time. There is no event id
  // in the body, and no header carries the type.
  const type: string = event.event_type;
  const data: Record<string, any> = event.data ?? {};
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  // (`webhook-test: true` marks "send test event" deliveries)
  console.log(`Received Pipecat Cloud webhook ${id}: ${type}`);

  switch (type) {
    case 'build.started': // best-effort: a fast build may emit only a terminal event
    case 'build.succeeded':
    case 'build.failed':
    case 'build.timeout':
      console.log(`Build ${type.split('.')[1]}:`, data.build_id, data.image_uri ?? data.error_message);
      break;
    case 'deployment.created':
    case 'deployment.updated':
      console.log(`Deployment ${type.split('.')[1]}:`, data.service_name, data.region);
      break;
    case 'service.suspended':
      console.log('Service suspended:', data.service_name, data.reason);
      break;
    case 'service.resumed':
      console.log('Service resumed:', data.service_name);
      break;
    case 'spend.threshold_reached':
      console.log(`Spend at ${data.percent}%:`, data.current_spend_cents, 'of', data.limit_cents, 'cents');
      break;
    case 'spend.limit_reached':
      console.log('Spend limit reached:', data.current_spend_cents, 'of', data.limit_cents, 'cents');
      break;
    case 'spend.limit_cleared':
      console.log('Spend limit cleared, was', data.previous_limit_cents, 'cents');
      break;
    case 'session.started':
      // This event spells the service name `service`, not `service_name`
      console.log('Session started:', data.session_id, data.service, data.transport);
      break;
    case 'org.trial_started':
      console.log('Trial started:', data.org_name, data.trial_credits_cents);
      break;
    case 'org.trial_ended':
      console.log('Trial credits exhausted:', data.org_name, data.amount_due_cents);
      break;
    case 'api_key.created':
    case 'api_key.rotated':
    case 'api_key.deleted':
      // The key value is never included
      console.log(`API key ${type.split('.')[1]}:`, data.key_id, data.type);
      break;
    case 'secret.created':
    case 'secret.updated':
    case 'secret.deleted':
      // Secret values are never included
      console.log(`Secret ${type.split('.')[1]}:`, data.set_name, data.scope, data.field_names);
      break;
    default:
      // Return 2xx for events you don't handle, or Pipecat Cloud keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
