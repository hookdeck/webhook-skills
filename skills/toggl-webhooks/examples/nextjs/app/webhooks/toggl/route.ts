// Generated with: toggl-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTogglWebhook } from '../../../lib/toggl';

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing — the signature covers the exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Webhook-Signature-256 header' }, { status: 400 });
  }
  if (!verifyTogglWebhook(rawBody, signature, process.env.TOGGL_WEBHOOK_SECRET)) {
    console.error('Toggl webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // PING events: payload is the string "ping". For subscriptions that are not
  // yet validated, they include validation_code — echo it to validate.
  if (event.payload === 'ping') {
    console.log(`Toggl PING for subscription ${event.subscription_id}`);
    if (event.validation_code) {
      return NextResponse.json({ validation_code: event.validation_code });
    }
    return NextResponse.json({ received: true });
  }

  const eventType = `${event.metadata?.model}.${event.metadata?.action}`;

  switch (eventType) {
    case 'time_entry.created':
      console.log('Time entry created:', event.payload?.description);
      // TODO: sync to billing, notify, etc.
      break;
    case 'time_entry.updated':
      console.log('Time entry updated:', event.payload?.id);
      break;
    case 'time_entry.deleted':
      console.log('Time entry deleted:', event.payload?.id ?? event.metadata?.model_id);
      break;
    case 'project.created':
      console.log('Project created:', event.payload?.name);
      break;
    case 'project.updated':
      console.log('Project updated:', event.payload?.name);
      break;
    case 'project.deleted':
      console.log('Project deleted:', event.payload?.id ?? event.metadata?.model_id);
      break;
    default:
      console.log(`Unhandled Toggl event: ${eventType}`);
  }

  // Any 2xx acknowledges delivery; non-2xx triggers a later retry
  return NextResponse.json({ received: true });
}
