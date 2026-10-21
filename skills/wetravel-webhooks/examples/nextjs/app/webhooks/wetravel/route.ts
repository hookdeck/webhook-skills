// Generated with: wetravel-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

type WeTravelEvent = { type: string; data?: Record<string, unknown> };

export async function POST(request: Request) {
  const secret = process.env.WETRAVEL_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // WeTravel delivers through Svix (svix-* headers). Accept the Standard
  // Webhooks webhook-* names too — the signing scheme is identical.
  const msgId = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const timestamp =
    request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const signature =
    request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!msgId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with the base64 key
    // after `whsec_`; checks every v1 signature and a 5-minute timestamp window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified — only now is it safe to parse.
  let event: WeTravelEvent;
  try {
    event = JSON.parse(rawBody) as WeTravelEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Svix envelope: { type, data }. Check the exact payload shape for each
  // event in WeTravel's "Manage Webhooks" > Event Catalog.
  const data = event.data ?? {};
  console.log(`Received WeTravel webhook: ${event.type} (${msgId})`);

  switch (event.type) {
    case 'booking.created':
      console.log('Booking created:', data.id);
      break;
    case 'booking.updated':
      console.log('Booking updated:', data.id);
      break;
    case 'payment.created':
      console.log('Payment created:', data.id);
      break;
    case 'payment.updated':
      console.log('Payment updated:', data.id);
      break;
    case 'transaction.created':
      console.log('Transaction created:', data.id);
      break;
    case 'transaction.updated':
      console.log('Transaction updated:', data.id);
      break;
    case 'trip.published':
      console.log('Trip published:', data.id);
      break;
    case 'lead.created':
      console.log('Lead created:', data.id);
      break;
    case 'lead.updated':
      console.log('Lead updated:', data.id);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  return NextResponse.json({ success: true, type: event.type }, { status: 200 });
}
