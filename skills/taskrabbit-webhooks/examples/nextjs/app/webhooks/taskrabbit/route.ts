// Generated with: taskrabbit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Taskrabbit payloads are flat: the event name is in `event` (not `type`).
type TaskrabbitEvent = {
  event: string;
  project_uuid: string;
  timestamp: string;
  agreement_external_reference?: string;
  cancellation_reason?: 'order_canceled' | 'delivery_delayed' | 'changed_mind' | 'canceled_by_cs';
  new_start_time?: string;
  previous_start_time?: string;
};

export async function POST(request: Request) {
  const secret = process.env.TASKRABBIT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Taskrabbit delivers via Svix: svix-* headers (webhook-* if white-labeled).
  const svixId = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const svixTimestamp =
    request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const svixSignature =
    request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    const wh = new Webhook(secret);
    // As of svix 2.x verify() returns undefined, so the payload is parsed below.
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let event: TaskrabbitEvent;
  try {
    event = JSON.parse(rawBody) as TaskrabbitEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received Taskrabbit webhook: ${event.event} (svix-id ${svixId})`);

  switch (event.event) {
    case 'project.completed':
      console.log('Project completed:', {
        projectUuid: event.project_uuid,
        reference: event.agreement_external_reference,
      });
      // TODO: mark the order fulfilled in your system
      break;
    case 'project.canceled':
      console.log('Project canceled:', {
        projectUuid: event.project_uuid,
        reason: event.cancellation_reason,
      });
      // TODO: release the order / notify the customer
      break;
    case 'project.rescheduled':
      console.log('Project rescheduled:', {
        projectUuid: event.project_uuid,
        from: event.previous_start_time,
        to: event.new_start_time,
      });
      // TODO: update the scheduled start time
      break;
    default:
      console.log('Unhandled event type:', event.event);
  }

  return NextResponse.json({ success: true, event: event.event }, { status: 200 });
}
