// Generated with: glean-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

type GleanEvent = {
  trigger_id?: string;
  event_type?: string;
  reason?: string;
  title?: string;
  view_url?: string;
  event_time?: string;
};

// Optional extra check: Authorization: Bearer <secret> when the trigger was
// created with delivery.auth type BEARER. It never replaces the signature.
function bearerOk(request: Request): boolean {
  const expected = process.env.GLEAN_DELIVERY_BEARER;
  if (!expected) return true;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(
    digest(request.headers.get('authorization') ?? ''),
    digest(`Bearer ${expected}`)
  );
}

export async function POST(request: Request) {
  const secret = process.env.GLEAN_SIGNING_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  if (!bearerOk(request)) {
    return NextResponse.json({ error: 'Invalid delivery credential' }, { status: 401 });
  }

  // Read the RAW body — do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // The library enforces a fixed 5-minute timestamp window. Retries/replays
    // keep the original timestamp, so late ones are rejected here. See
    // references/verification.md for a manual verifier with a configurable window.
    new Webhook(secret).verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /timestamp/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  let event: GleanEvent;
  try {
    event = JSON.parse(rawBody) as GleanEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Presets are per deployment: dispatch on the payload's event_type.
  console.log(`Received Glean trigger ${event.trigger_id} (${event.event_type}) webhook-id=${id}`);

  switch (event.event_type) {
    case 'CONTENT_SCHEDULE':
      console.log('Scheduled event:', {
        title: event.title,
        event_time: event.event_time,
        view_url: event.view_url,
      });
      break;
    default:
      console.log('Unhandled event type:', event.event_type, event.reason);
  }

  return NextResponse.json({ success: true, event_type: event.event_type }, { status: 200 });
}
