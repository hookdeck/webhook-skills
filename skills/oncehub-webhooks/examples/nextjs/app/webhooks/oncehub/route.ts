// Generated with: oncehub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOncehubWebhook } from '../../../lib/oncehub';

interface OnceHubEvent {
  id: string;
  object: 'event';
  creation_time: string;
  type: string;
  api_version: string;
  data: Record<string, any> | null;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  const rawBody = await request.text();
  const header = request.headers.get('oncehub-signature');
  const secret = process.env.ONCEHUB_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing Oncehub-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('ONCEHUB_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyOncehubWebhook(rawBody, header, secret)) {
    console.error('OnceHub webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification. The body is a single event object.
  let event: OnceHubEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = event;
  switch (type) {
    case 'booking.scheduled':
      console.log(`Booking scheduled: ${data?.id} (${data?.subject}) at ${data?.starting_time}`);
      break;
    case 'booking.rescheduled':
      console.log(`Booking rescheduled: ${data?.id} (was ${data?.rescheduled_booking_id})`);
      break;
    case 'booking.reassigned':
      console.log(`Booking reassigned: ${data?.id} to ${data?.owner?.email}`);
      break;
    case 'booking.canceled_then_rescheduled':
      console.log(`Booking canceled then rescheduled: ${data?.id}`);
      break;
    case 'booking.canceled_reschedule_requested':
      console.log(`Booking canceled, reschedule requested: ${data?.id}`);
      break;
    case 'booking.canceled':
      console.log(`Booking canceled: ${data?.id} (${data?.cancel_reschedule_information?.reason || 'no reason'})`);
      break;
    case 'booking.completed':
      console.log(`Booking completed: ${data?.id}`);
      break;
    case 'booking.no_show':
      console.log(`Booking no-show: ${data?.id}`);
      break;
    case 'conversation.started':
    case 'conversation.closed':
    case 'conversation.abandoned':
      console.log(`${type}: ${data?.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Use the event `id` (EVNT-...) as the idempotency key.

  // Return 2XX once accepted; otherwise OnceHub retries (exponential backoff, ~3 days) and then disables the webhook.
  return NextResponse.json({ received: true });
}
