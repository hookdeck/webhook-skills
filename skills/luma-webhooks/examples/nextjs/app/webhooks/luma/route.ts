// Generated with: luma-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLumaWebhook } from '../../../lib/luma';

interface LumaEvent {
  type: string;
  data: Record<string, any> | null;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  const rawBody = await request.text();
  const header = request.headers.get('webhook-signature');
  const secret = process.env.LUMA_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing Webhook-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('LUMA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyLumaWebhook(rawBody, header, secret)) {
    console.error('Luma webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification. Body shape: { type, data }.
  let event: LumaEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = event;
  switch (type) {
    case 'guest.registered':
      console.log(`Guest registered: ${data?.user_email} for ${data?.event?.name}`);
      break;
    case 'guest.updated':
      console.log(`Guest updated: ${data?.user_email} (${data?.approval_status})`);
      break;
    case 'guest.refunded':
      console.log(`Guest refunded: ${data?.user_email}`);
      break;
    case 'ticket.registered':
      console.log(`Ticket registered: ${data?.event_ticket?.id} for ${data?.user_email}`);
      break;
    case 'event.created':
      console.log(`Event created: ${data?.name} (${data?.id})`);
      break;
    case 'event.updated':
      console.log(`Event updated: ${data?.name} (${data?.id})`);
      break;
    case 'event.canceled':
      console.log(`Event canceled: ${data?.name} (${data?.id})`);
      break;
    case 'calendar.event.added':
      console.log(`Event added to calendar: ${data?.name ?? data?.id}`);
      break;
    case 'calendar.event.submitted':
      console.log(`Event submitted for approval: ${data?.name ?? data?.id}`);
      break;
    case 'calendar.person.subscribed':
      console.log(`Calendar person subscribed: ${data?.email}`);
      break;
    case 'calendar.person.unsubscribed':
      console.log(`Calendar person unsubscribed: ${data?.email}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. Use the Webhook-Id header as an idempotency key; Luma may
  // deliver the same event more than once.

  // Respond 2xx within 5 seconds, otherwise Luma retries (a 410 pauses the webhook).
  return NextResponse.json({ received: true });
}
