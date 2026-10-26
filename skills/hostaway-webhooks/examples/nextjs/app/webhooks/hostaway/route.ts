// Generated with: hostaway-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { getEventName, verifyHostawayRequest } from '../../../lib/verify-hostaway';

function handleEvent(payload: unknown): void {
  const event = getEventName(payload);

  switch (event) {
    case 'reservation.created':
      console.log('Reservation created');
      // TODO: sync the new booking (payload.data)
      break;

    case 'reservation.updated':
      console.log('Reservation updated');
      // TODO: update the stored booking
      break;

    case 'message.received':
      console.log('Guest message received');
      // TODO: route the message to your inbox
      break;

    case 'task.created':
      console.log('Task created');
      // TODO: create the matching task
      break;

    case 'task.updated':
      console.log('Task updated');
      // TODO: update the matching task
      break;

    default:
      // Unknown shape: log the top-level keys (not the values) so you can extend this handler.
      console.log(
        `Unhandled event: ${event}`,
        payload && typeof payload === 'object' ? Object.keys(payload) : typeof payload
      );
  }
}

// Hostaway's docs don't name the HTTP method, so every method goes through the same handler.
async function handle(request: NextRequest) {
  // Check the credential first, before reading the body, for every method.
  if (!verifyHostawayRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  // Read as text so any content type is accepted; an empty body is fine.
  const raw = await request.text();
  let payload: unknown = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      // The body format isn't documented: acknowledge and log rather than reject.
      console.log(`Non-JSON body (${raw.length} chars) on ${request.method}`);
    }
  } else {
    console.log(`Empty body on ${request.method}`);
  }

  if (payload !== null) {
    try {
      handleEvent(payload);
    } catch (err) {
      console.error('Error handling Hostaway event:', err);
      return NextResponse.json({ error: 'Handler error' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
