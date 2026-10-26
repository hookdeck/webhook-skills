// Generated with: delivereasy-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDelivereasy } from '../../../lib/verify-delivereasy';

export async function POST(request: NextRequest) {
  // Raw bytes: exactly what Delivereasy signed
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyDelivereasy(rawBody, request.headers.get('x-signature'), process.env.DELIVEREASY_WEBHOOK_SECRET)) {
    console.error('Delivereasy signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let booking: { id?: number | string; booking_identifier?: string; status?: string };
  try {
    booking = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!booking || typeof booking !== 'object' || Array.isArray(booking)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // The payload is the booking itself; there is no event name. Dispatch on status.
  // Delivery is at least once: deduplicate on booking.id.
  console.log(`Booking ${booking.id} (${booking.booking_identifier}) status: ${booking.status}`);
  // TODO: enqueue for async processing, keyed by booking.id and status

  return NextResponse.json({ received: true });
}
