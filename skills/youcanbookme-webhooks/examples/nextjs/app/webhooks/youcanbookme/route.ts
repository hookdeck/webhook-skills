// Generated with: youcanbookme-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyYoucanbookmeRequest } from '../../../lib/verify-youcanbookme';

// The body is the owner's template, so `event` is whatever the template names.
interface YoucanbookmePayload {
  event?: string;
  email?: string;
  [key: string]: unknown;
}

function handleEvent(payload: YoucanbookmePayload): void {
  const { event } = payload;

  switch (event) {
    case 'booking_made':
      console.log(`Booking made: ${payload.email}`);
      // TODO: create the CRM contact or calendar entry
      break;

    case 'booking_rescheduled':
      console.log(`Booking rescheduled: ${payload.email}`);
      // TODO: move the matching record
      break;

    case 'booking_cancelled':
      console.log(`Booking cancelled: ${payload.email}`);
      // TODO: cancel downstream work
      break;

    case 'reminder':
      console.log(`Reminder: ${payload.email}`);
      // TODO: send a nudge
      break;

    case 'follow_up':
      console.log(`Follow-up: ${payload.email}`);
      // TODO: trigger a survey or thank-you
      break;

    case 'no_show':
      console.log(`No-show: ${payload.email}`);
      // TODO: flag the contact
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyYoucanbookmeRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; an empty body (e.g. GET) is valid.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as YoucanbookmePayload);
  } catch (err) {
    console.error('Error handling YouCanBookMe event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The method is user-chosen in YouCanBookMe, so accept all of these.
export {
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as GET,
};
