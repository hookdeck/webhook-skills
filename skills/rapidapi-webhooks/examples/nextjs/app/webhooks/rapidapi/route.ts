// Generated with: rapidapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRapidApiRequest } from '../../../lib/verify-rapidapi';

type RapidApiPayload = Record<string, unknown>;

// The body format isn't documented. Name the JSON field that holds the event type
// (for example after sending a "Test event" from the Admin Panel) in RAPIDAPI_EVENT_FIELD.
function getEventName(payload: RapidApiPayload): string | undefined {
  const field = process.env.RAPIDAPI_EVENT_FIELD;
  const value = field ? payload[field] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function handleEvent(payload: RapidApiPayload): void {
  const event = getEventName(payload);

  switch (event) {
    case 'API Created':
      console.log('API created');
      // TODO: sync the new API to your catalog or gateway
      break;

    case 'API Updated':
      console.log('API updated');
      // TODO: refresh the API in your gateway
      break;

    case 'API Deleted':
      console.log('API deleted');
      // TODO: remove the API from your gateway
      break;

    case 'Subscription Created':
      console.log('Subscription created');
      // TODO: sync the new subscription to your CRM or billing system
      break;

    case 'Subscription Updated':
      console.log('Subscription updated');
      // TODO: update the subscription downstream
      break;

    case 'User Created':
      console.log('User created');
      // TODO: provision the user in your systems
      break;

    case 'Billing Plan Updated':
      console.log('Billing plan updated');
      // TODO: update plan pricing downstream
      break;

    default:
      console.log(`Unhandled event: ${event ?? 'unknown (set RAPIDAPI_EVENT_FIELD)'}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRapidApiRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-rapidapi-webhook-secret' }, { status: 401 });
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
    handleEvent(payload as RapidApiPayload);
  } catch (err) {
    console.error('Error handling RapidAPI event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
