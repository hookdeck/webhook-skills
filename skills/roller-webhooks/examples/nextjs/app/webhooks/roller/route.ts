// Generated with: roller-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRollerRequest } from '../../../lib/verify-roller';

interface RollerPayload {
  type?: string; // Booking, Customer, Redemption, BulkExport, SignedWaiver, PaymentLink
  eventType?: string; // Created, Updated, Cancelled
  [key: string]: unknown;
}

// ROLLER sends `type` and `eventType` as separate fields (never a dotted name);
// compose them into one key to dispatch on.
function handleEvent(payload: RollerPayload): void {
  const event = `${payload.type}.${payload.eventType}`;
  switch (event) {
    case 'Booking.Created':
      console.log(`Booking created`);
      // TODO: handle Booking.Created
      break;

    case 'Booking.Updated':
      console.log(`Booking updated`);
      // TODO: handle Booking.Updated
      break;

    case 'Booking.Cancelled':
      console.log(`Booking cancelled`);
      // TODO: handle Booking.Cancelled
      break;

    case 'Customer.Created':
      console.log(`Customer created`);
      // TODO: handle Customer.Created
      break;

    case 'Redemption.Created':
      console.log(`Redemption created`);
      // TODO: handle Redemption.Created
      break;

    case 'PaymentLink.Created':
      console.log(`Payment link created`);
      // TODO: handle PaymentLink.Created
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRollerRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-roller-apikey' }, { status: 401 });
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
    handleEvent(payload as RollerPayload);
  } catch (err) {
    console.error('Error handling ROLLER event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
