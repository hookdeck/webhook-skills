// Generated with: coinbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { dedupeKey, handleEvent, processedEvents, verifyCoinbaseSignature, type Json } from '../../../lib/coinbase';

// Coinbase Developer Platform (CDP) webhooks v2. Verification uses Node's crypto module.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.COINBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COINBASE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // X-Hook0-Signature is a deprecated alias carrying the identical value.
  const signatureHeader = request.headers.get('x-webhook-signature') ?? request.headers.get('x-hook0-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // Raw body is mandatory: the signature covers the exact bytes sent.
  const rawBody = await request.text();

  const result = verifyCoinbaseSignature(rawBody, signatureHeader, (name) => request.headers.get(name), secret);
  if (!result.valid) {
    console.error(`Coinbase webhook verification failed: ${result.reason}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let body: Json;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Route on the X-Event-Type header; fall back to the body (`type`, then `eventType`).
  const eventType: string | undefined = request.headers.get('x-event-type') ?? body.type ?? body.eventType;

  // Delivery is at-least-once: duplicates are expected.
  const key = dedupeKey(eventType, body, request.headers.get('x-event-id'));
  if (key && processedEvents.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  handleEvent(eventType, body);
  if (key) processedEvents.add(key);

  // Acknowledge fast. In production, enqueue the event and process it asynchronously.
  return NextResponse.json({ received: true, type: eventType });
}
