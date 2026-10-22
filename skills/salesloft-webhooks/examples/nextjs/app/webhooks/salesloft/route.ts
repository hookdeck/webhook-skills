import { NextRequest, NextResponse } from 'next/server';
import { verifySalesloftSignature } from '../../../lib/verify-salesloft';

// The event name is in the x-salesloft-event header; the body is the resource object
function handleSalesloftEvent(eventType: string | null, payload: unknown) {
  switch (eventType) {
    case 'person_created':
      console.log('Person created');
      // TODO: Sync the new person to your CRM or data warehouse
      break;

    case 'person_updated':
      console.log('Person updated');
      // TODO: Update your copy of the person
      break;

    case 'call_created':
      console.log('Call created');
      // TODO: Log the call activity
      break;

    case 'email_updated':
      console.log('Email updated');
      // TODO: Track opens, clicks, and replies
      break;

    case 'meeting_booked':
      console.log('Meeting booked');
      // TODO: Notify the account owner or create a calendar event
      break;

    case 'cadence_membership_created':
      console.log('Cadence membership created');
      // TODO: Record that a person was added to a cadence
      break;

    default:
      console.log(`Unhandled Salesloft event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  const callbackToken = process.env.SALESLOFT_CALLBACK_TOKEN;
  if (!callbackToken) {
    console.error('SALESLOFT_CALLBACK_TOKEN is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-salesloft-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-salesloft-signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifySalesloftSignature(rawBody, signature, callbackToken)) {
    console.error('Salesloft webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  handleSalesloftEvent(request.headers.get('x-salesloft-event'), payload);

  return NextResponse.json({ received: true });
}
