// Generated with: autumn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { handleEvent, verifyAutumnWebhook, type AutumnEvent } from '../../../lib/autumn';

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message to this endpoint.
const processedMessageIds = new Set<string>();

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.AUTUMN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AUTUMN_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  // request.text() works for any content type.
  const rawBody = await request.text();

  let event: AutumnEvent;
  try {
    event = verifyAutumnWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('Autumn webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast; in production enqueue the event and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(svixId);
  } catch (err) {
    console.error('Error handling Autumn event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
