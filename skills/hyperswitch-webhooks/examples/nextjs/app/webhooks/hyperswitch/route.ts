// Generated with: hyperswitch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  handleHyperswitchEvent,
  processedEventIds,
  verifyHyperswitchSignature,
  type HyperswitchEvent,
} from '../../../lib/hyperswitch';

export async function POST(request: NextRequest) {
  const secret = process.env.HYPERSWITCH_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverified deliveries.
    console.error('HYPERSWITCH_WEBHOOK_SECRET is not set; rejecting webhook');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes for any content type; parse only after verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const verification = verifyHyperswitchSignature(
    rawBody,
    request.headers.get('x-webhook-signature-512'),
    secret
  );

  if (!verification.valid) {
    console.error('Hyperswitch webhook verification failed:', verification.error);
    return new NextResponse(`Webhook Error: ${verification.error}`, { status: 401 });
  }

  let event: HyperswitchEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Invalid JSON payload:', (err as Error).message);
    return new NextResponse('Invalid JSON payload', { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retries can deliver the same event twice: acknowledge duplicates without re-applying.
  if (event.event_id && processedEventIds.has(event.event_id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleHyperswitchEvent(event);
    if (event.event_id) processedEventIds.add(event.event_id);
  } catch (err) {
    console.error('Error processing Hyperswitch event:', err);
    return new NextResponse('Processing error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
