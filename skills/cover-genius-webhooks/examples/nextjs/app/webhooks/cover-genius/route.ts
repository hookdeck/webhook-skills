// Generated with: cover-genius-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCoverGeniusRequest } from '../../../lib/verify-cover-genius';

interface CoverGeniusEvent {
  event?: string;
  payload?: Record<string, any>;
}

function handleEvent(body: CoverGeniusEvent): void {
  const { event, payload = {} } = body;

  switch (event) {
    case 'BOOKING_CREATED':
      console.log(`Booking created: ${payload.id} (${payload.total_price_formatted})`);
      // TODO: send the customer confirmation
      break;

    case 'BOOKING_UPDATED':
      console.log(`Booking updated: ${payload.id}`);
      // TODO: sync the updated policy details
      break;

    case 'BOOKING_CANCELLED':
      console.log(`Booking cancelled: ${payload.id}`);
      // TODO: process the refund / cancel fulfilment
      break;

    case 'RENEWAL_CREATED':
      console.log(`Renewal created: ${payload.id} (package ${payload.package_id})`);
      // TODO: record the renewed policy
      break;

    case 'RENEWAL_NOTIFICATION':
      console.log(`Renewal approaching: ${payload.id}, due ${payload.due_date}`);
      // TODO: remind the customer
      break;

    case 'RENEWAL_DUE':
      console.log(`Renewal due: ${payload.id}, grace period ends ${payload.expiry_date}`);
      // TODO: prompt the customer to pay
      break;

    case 'RENEWAL_EXPIRED':
      console.log(`Renewal expired: ${payload.id}`);
      // TODO: mark the policy as lapsed
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body (works for any content type).
  if (!verifyCoverGeniusRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-Api-Key' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(body as CoverGeniusEvent);
  } catch (err) {
    console.error('Error handling Cover Genius event:', err);
    // Anything other than 200 makes Cover Genius retry (up to 3 times).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
