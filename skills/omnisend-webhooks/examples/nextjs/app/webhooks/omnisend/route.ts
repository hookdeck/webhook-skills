// Generated with: omnisend-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOmnisendRequest } from '../../../lib/verify-omnisend';

// The body is the author's JSON template, so `event` is whatever the template sets.
interface OmnisendPayload {
  event?: string;
  contactEmail?: string;
  [key: string]: unknown;
}

function handleEvent(payload: OmnisendPayload): void {
  const { event } = payload;

  switch (event) {
    case 'subscribed':
      console.log(`Contact subscribed: ${payload.contactEmail}`);
      // TODO: add the contact to your CRM or messaging tool
      break;

    case 'placed order':
      console.log(`Order placed by: ${payload.contactEmail}`);
      // TODO: sync the order (use [[event.raw.<property>]] tags for order data)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOmnisendRequest(request.headers)) {
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
    handleEvent(payload as OmnisendPayload);
  } catch (err) {
    console.error('Error handling Omnisend event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
