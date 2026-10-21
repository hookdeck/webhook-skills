// Generated with: guesty-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Guesty puts the event name in `event`. The object key depends on the event:
// `data` (reservation v2), `reservation`, `listing`, `guest`, `payment`.
type GuestyEvent = {
  event: string;
  meta?: {
    eventId?: string;
    messageId?: string;
    publishedAt?: string;
    changedFields?: string[];
    subType?: string;
  };
  data?: { reservationId?: string };
  reservation?: { _id?: string };
  listing?: { _id?: string };
  guest?: { _id?: string };
  payment?: { reservationId?: string; amount?: number; currency?: string };
};

export async function POST(request: Request) {
  const secret = process.env.GUESTY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing required webhook headers (svix-id, svix-timestamp, svix-signature)' },
      { status: 400 }
    );
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // The SDK decodes the whsec_ secret, checks every v1 signature in constant
    // time, and enforces a 5-minute timestamp tolerance. As of svix 2.x
    // verify() returns undefined; the body is parsed below.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    const msg = err instanceof Error ? err.message : '';
    const detail = /timestamp/i.test(msg) ? 'Invalid timestamp' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let event: GuestyEvent;
  try {
    event = JSON.parse(rawBody) as GuestyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Deduplicate on svix-id and meta.eventId (when present) before doing real work.
  const eventName = event.event;
  console.log(`Received Guesty webhook: ${eventName}`, {
    svixId,
    eventId: event.meta?.eventId,
  });

  switch (eventName) {
    case 'reservation.created.v2':
      console.log('Reservation created:', { reservationId: event.data?.reservationId });
      break;
    case 'reservation.updated.v2':
      console.log('Reservation updated:', {
        reservationId: event.data?.reservationId,
        changedFields: event.meta?.changedFields,
        subType: event.meta?.subType,
      });
      break;
    case 'reservation.new':
      console.log('Reservation created (legacy):', { reservationId: event.reservation?._id });
      break;
    case 'reservation.updated':
      console.log('Reservation updated (legacy):', { reservationId: event.reservation?._id });
      break;
    case 'listing.new':
      console.log('Listing created:', { listingId: event.listing?._id });
      break;
    case 'listing.updated':
      console.log('Listing updated:', { listingId: event.listing?._id });
      break;
    case 'listing.removed':
      console.log('Listing removed:', { listingId: event.listing?._id });
      break;
    case 'guest.created':
      console.log('Guest created:', { guestId: event.guest?._id });
      break;
    case 'payments.received':
      console.log('Payment received:', {
        reservationId: event.payment?.reservationId,
        amount: event.payment?.amount,
        currency: event.payment?.currency,
      });
      break;
    default:
      console.log('Unhandled event:', eventName);
  }

  // Respond quickly (Guesty expects 2xx within ~15s); fetch fresh data from
  // the Open API asynchronously if you need the full object.
  return NextResponse.json({ received: true, event: eventName }, { status: 200 });
}
