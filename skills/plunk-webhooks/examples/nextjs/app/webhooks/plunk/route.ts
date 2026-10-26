// Generated with: plunk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classifyEvent, verifyPlunkRequest } from '../../../lib/verify-plunk';

// Default body (no custom body on the step): { contact, workflow, execution, event }.
// A custom body replaces it entirely, so every field is optional.
interface PlunkPayload {
  contact?: { email?: string; [key: string]: unknown };
  workflow?: { id?: string; name?: string };
  execution?: { id?: string; startedAt?: string };
  event?: Record<string, unknown>;
  [key: string]: unknown;
}

function handleEvent(payload: PlunkPayload | null): void {
  const { contact, workflow, event } = payload ?? {};
  const kind = classifyEvent(event);

  switch (kind) {
    case 'email.bounce':
      console.log(`Email bounced (${event?.bounceType}) for ${contact?.email}`);
      // TODO: mark the address undeliverable (event.emailId, event.transientBounce)
      break;

    case 'email.complaint':
      console.log(`Spam complaint from ${contact?.email}`);
      // TODO: suppress the contact in your own database
      break;

    case 'email.click':
      console.log(`Link clicked by ${contact?.email}: ${event?.link}`);
      break;

    case 'email.open':
      console.log(`Email opened by ${contact?.email}`);
      break;

    case 'email.delivery':
      console.log(`Email delivered to ${contact?.email}`);
      break;

    case 'email.sent':
      console.log(`Email sent to ${contact?.email}`);
      break;

    case 'email.received':
      console.log(`Inbound email from ${event?.from}`);
      break;

    case 'segment':
      console.log(`Segment event for ${event?.segmentName}`);
      break;

    default:
      // Contact events, custom events and custom bodies land here: plain JSON.
      console.log(`Plunk webhook${workflow?.name ? ` from workflow "${workflow.name}"` : ''}`);
  }
}

// One handler for every method the webhook step can use (default POST).
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPlunkRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET/DELETE and custom bodies may be empty.
  const raw = await request.text();
  let payload: PlunkPayload | null = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Plunk webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
