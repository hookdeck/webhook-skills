// Generated with: webinarjam-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebinarJamRequest } from '../../../lib/verify-webinarjam';

function handleEvent(payload: Record<string, unknown>): void {
  // WebinarJam documents no event field: add `event` as a custom body key-value pair
  // (or use a different URL path per automation rule) to tell triggers apart.
  switch (payload.event) {
    case 'registered':
      console.log(`Registered: ${payload.email}`);
      // TODO: add the lead to your CRM and send the live room link
      break;

    case 'attended_live':
      console.log(`Attended live: ${payload.email}`);
      // TODO: tag the lead as an attendee
      break;

    case 'missed_live':
      console.log(`Missed live: ${payload.email}`);
      // TODO: send the replay link
      break;

    case 'left_early':
      console.log(`Left early: ${payload.email}`);
      // TODO: follow up with the replay
      break;

    case 'purchased':
      console.log(`Purchased: ${payload.email}`);
      // TODO: mark the lead as a customer
      break;

    default:
      console.log(`Unhandled WebinarJam trigger "${payload.event}": ${payload.email}`);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.WEBINARJAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  // Authenticate before reading or parsing the body.
  if (!verifyWebinarJamRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling WebinarJam webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
