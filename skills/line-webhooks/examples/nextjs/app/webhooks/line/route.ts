// Generated with: line-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { handleEvent, verifyLineSignature, type LineWebhookBody } from '../../../lib/line';

// The LINE SDK's validateSignature uses node:crypto, so run on the Node.js runtime (not Edge)
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-line-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-line-signature header' }, { status: 400 });
  }

  // Read the raw bytes - verify BEFORE parsing, never a re-serialized body
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyLineSignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    console.error('LINE webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: LineWebhookBody;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];

  // The console "Verify" button sends {"destination": "...", "events": []} - acknowledge it
  if (events.length === 0) {
    console.log(`Webhook verification request for ${payload.destination}`);
    return NextResponse.json({ received: true });
  }

  for (const event of events) {
    if (event.deliveryContext?.isRedelivery) {
      // Redelivered events keep the same webhookEventId - dedupe on it
      console.log('Redelivered event:', event.webhookEventId);
    }
    handleEvent(event);
  }

  // Return 2xx quickly; LINE redelivers (if enabled) only on non-2xx responses
  return NextResponse.json({ received: true });
}
