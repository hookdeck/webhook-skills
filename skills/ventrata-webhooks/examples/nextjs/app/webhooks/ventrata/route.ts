// Generated with: ventrata-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEvent, verifyVentrataRequest } from '../../../lib/verify-ventrata';

interface VentrataPayload {
  event?: string;
  webhook?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  order?: { orderId?: string; [key: string]: unknown };
  booking?: { uuid?: string; [key: string]: unknown };
  product?: { id?: string; [key: string]: unknown };
  availability?: { id?: string; [key: string]: unknown };
  diff?: unknown[];
  [key: string]: unknown;
}

function handleEvent(payload: VentrataPayload): void {
  switch (normalizeEvent(payload.event)) {
    case 'order_update':
      console.log(`Order updated: ${payload.order?.orderId}`);
      // TODO: sync payload.order; payload.diff lists what changed
      break;

    case 'booking_update':
      console.log(`Booking updated: ${payload.booking?.uuid}`);
      // TODO: sync payload.booking; payload.diff lists what changed
      break;

    case 'availability_update':
      console.log(`Availability updated: ${payload.availability?.id}`);
      // TODO: refresh inventory from payload.availability
      break;

    case 'product_update':
      console.log(`Product updated: ${payload.product?.id}`);
      // TODO: re-sync payload.product; payload.diff lists what changed
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyVentrataRequest(request.headers)) {
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
    handleEvent(payload as VentrataPayload);
  } catch (err) {
    console.error('Error handling Ventrata event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
