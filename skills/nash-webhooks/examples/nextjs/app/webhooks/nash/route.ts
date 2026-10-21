// Generated with: nash-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Envelope: { type, event, data }. type is the entity, event the status within it.
type NashEntity = 'delivery' | 'task' | 'courier_location' | 'courier_name' | 'shift';

interface NashWebhookEvent {
  type: NashEntity | string;
  event: string;
  data: Record<string, any>;
}

export async function POST(request: Request) {
  const secret = process.env.NASH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NASH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Nash delivers webhooks through Svix.
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // The signature covers the RAW body: read text, never request.json(), first.
  const rawBody = await request.text();

  try {
    // HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}", 5-minute
    // timestamp tolerance. In svix 2.x verify() returns nothing.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Nash webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Verified: only now is it safe to parse.
  let payload: NashWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as NashWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, event, data } = payload;
  const eventType = `${type}.${event}`;

  // svix-id is the same on every retry of a message: use it to deduplicate.
  console.log(`Received Nash webhook ${eventType} (${svixId})`);

  switch (eventType) {
    case 'delivery.created':
    case 'delivery.assigned_driver':
      console.log('Delivery progressing:', { jobId: data?.id, event });
      break;
    case 'delivery.dropoff_complete':
      console.log('Delivery completed:', { jobId: data?.id });
      break;
    case 'delivery.canceled_by_provider':
    case 'delivery.failed':
      console.log('Delivery did not complete:', { jobId: data?.id, event });
      break;
    case 'task.created':
      // A new task (delivery attempt) on the job, e.g. after a reassignment.
      console.log('Task created:', { jobId: data?.id });
      break;
    case 'task.canceled_by_provider':
    case 'task.failed':
      // Terminal for this task only; the job may continue on another task.
      console.log('Task ended:', { jobId: data?.id, event });
      break;
    case 'courier_location.updated':
    case 'courier_name.updated':
      console.log('Courier update:', { jobId: data?.id, event });
      break;
    case 'shift.dispatched':
      console.log('Shift dispatched:', {
        createdJobIds: data?.created_job_ids,
        errors: data?.errors,
      });
      break;
    default:
      console.log('Unhandled Nash event:', eventType);
  }

  return NextResponse.json({ received: true, type: eventType }, { status: 200 });
}
