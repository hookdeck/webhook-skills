// Generated with: felloh-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFellohSignature } from '../../../lib/verify-felloh';

type Obj = Record<string, any>;

const isObject = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Felloh has no event-name field or header, so deliveries are told apart by shape.
 * Every field is untrusted: check types before reading into nested objects.
 */
function classify(payload: Obj): string | null {
  if (isObject(payload.user)) return 'user-create';
  if (isObject(payload.transaction) && isObject(payload.status)) return 'refund-status';
  if (isObject(payload.transaction) && typeof payload.status === 'string') return 'transaction-status';
  if (isObject(payload.booking) && !('transaction' in payload)) return 'booking';
  return null;
}

function handleEvent(payload: Obj): void {
  switch (classify(payload)) {
    case 'transaction-status': {
      // Retried up to 5 times about a minute apart, so make this idempotent.
      console.log(`Transaction ${payload.transaction.id} is ${payload.status}`);
      // TODO: update the order or payment for payload.booking?.booking_reference
      break;
    }

    case 'refund-status': {
      console.log(`Refund for transaction ${payload.transaction.id} is ${payload.status.id}`);
      // TODO: update the refund record (payload.authorisation_code, payload.amount)
      break;
    }

    case 'booking': {
      console.log(`Booking ${payload.booking.booking_reference}`);
      // TODO: sync the booking (payload.customer_name, payload.departure_date, payload.return_date)
      break;
    }

    case 'user-create': {
      console.log(`User created: ${payload.user.id}`);
      // TODO: provision or audit the new user (payload.email, payload.organisation)
      break;
    }

    default:
      console.log('Unhandled Felloh delivery');
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, so the exact body is verified whatever the content type.
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (!verifyFellohSignature(rawBody, request.headers.get('x-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  // Dashboard test deliveries are signed with the real key and never retried.
  if (request.headers.get('x-felloh-test') === 'true') {
    console.log('Felloh test delivery');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Felloh event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
