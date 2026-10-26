// Generated with: amplitude-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAmplitudeRequest } from '../../../lib/verify-amplitude';

interface AmplitudePayload {
  event_type?: string;
  user_id?: string;
  device_id?: string;
  [key: string]: unknown;
}

// Default payloads: an event follows Amplitude's event format (has event_type);
// a user update follows the user format (user_id and/or device_id, user_properties).
// A FreeMarker template changes the shape, so branch on what your template emits.
function handlePayload(payload: AmplitudePayload): void {
  if (typeof payload.event_type === 'string') {
    console.log(`Event ${payload.event_type} for user ${payload.user_id ?? payload.device_id}`);
    // TODO: use payload.event_properties, payload.user_properties, payload.event_time
    return;
  }

  if (payload.user_id !== undefined || payload.device_id !== undefined) {
    console.log(`User properties update for ${payload.user_id ?? payload.device_id}`);
    // TODO: sync payload.user_properties
    return;
  }

  console.log('Unrecognised payload shape (custom FreeMarker template?)');
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAmplitudeRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handlePayload(payload as AmplitudePayload);
  } catch (err) {
    console.error('Error handling Amplitude payload:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
