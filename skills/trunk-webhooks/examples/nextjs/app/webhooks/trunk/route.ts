// Generated with: trunk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.TRUNK_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TRUNK_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Trunk (Svix) signed
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
    console.error('Trunk webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Flat body: the event name is the top-level `type`, next to the resource fields
  // (`test_case`, `repository`, `monitor`, `pr_number`, ...). `timestamp` is an ISO 8601 time: order by
  // it, not by receive time. There is no event id in the body, and no header carries the type.
  const type: string = event.type;
  // `svix-id` is stable across retries of the same message: use it to deduplicate
  console.log(`Received Trunk webhook ${id}: ${type}`);

  switch (type) {
    // Merge Queue: one event per PR moving through the queue
    case 'pull_request.queued':
    case 'pull_request.submitted':
    case 'pull_request.testing':
    case 'pull_request.pending_failure':
    case 'pull_request.failed':
    case 'pull_request.canceled':
    case 'pull_request.merged':
      console.log(`Merge Queue PR ${event.pr_number} ${type.split('.')[1]}:`, event.status);
      break;
    // Merge Queue: a batch of PRs tested together (subscribe to this family separately)
    case 'pull_request_batch.queued':
    case 'pull_request_batch.submitted':
    case 'pull_request_batch.testing':
    case 'pull_request_batch.pending_failure':
    case 'pull_request_batch.failed':
    case 'pull_request_batch.canceled':
    case 'pull_request_batch.merged':
      console.log(`Merge Queue batch ${type.split('.')[1]}:`, event.status);
      break;
    // Flaky Tests: the v1 event is being phased out in favor of v2.test_case.status_changed
    case 'test_case.status_changed':
    case 'v2.test_case.status_changed':
      console.log(`Test ${event.test_case?.name}: ${event.previous_status} -> ${event.new_status}`);
      break;
    case 'test_case.monitor_status_changed':
      console.log(`Monitor ${event.monitor?.type} ${event.monitor?.status}:`, event.test_case?.name);
      break;
    // Fires only when a setting is manually overridden to ALWAYS_QUARANTINE or NEVER_QUARANTINE
    case 'test_case.quarantining_setting_changed':
    case 'v2.test_case.quarantining_setting_changed':
      console.log('Quarantine setting changed:', event.test_case?.name, event.test_case?.quarantined);
      break;
    case 'test_case.investigation_completed':
      console.log('AI investigation completed:', event.test_case?.name, event.trigger, event.confidence);
      break;
    default:
      // Return 2xx for events you don't handle, or Trunk keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
