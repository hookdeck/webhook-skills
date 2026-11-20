// Generated with: strike-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse, after } from 'next/server';
import {
  EVENT_RESOURCES,
  configuredSecrets,
  processEvent,
  seenEventIds,
  verifyStrikeSignature,
  type StrikeWebhookEvent,
} from '../../../lib/strike';

export async function POST(request: Request) {
  const secrets = configuredSecrets();
  if (secrets.length === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('STRIKE_WEBHOOK_SECRET is not set: rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 });
  }

  // Read the raw bytes: the HMAC covers the exact body Strike sent.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyStrikeSignature(rawBody, request.headers.get('x-webhook-signature'), secrets)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: StrikeWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || typeof event.id !== 'string') {
    return NextResponse.json({ error: 'Not a Strike webhook event' }, { status: 400 });
  }

  // Only the v1 payload is documented. Make a version change loud, not silent.
  // The event stays recoverable via GET /v1/events for 30 days.
  if (event.webhookVersion !== 'v1') {
    console.error(`Unsupported webhookVersion ${event.webhookVersion} on event ${event.id}`);
    return NextResponse.json({ received: true, id: event.id, ignored: 'unsupported webhookVersion' });
  }

  if (seenEventIds.has(event.id)) {
    return NextResponse.json({ received: true, id: event.id, duplicate: true });
  }
  seenEventIds.add(event.id);

  if (!EVENT_RESOURCES[event.eventType]) {
    // Strike can add event types within v1 without notice: acknowledge, don't 4xx.
    console.log(`Ignoring unknown Strike eventType ${event.eventType}`);
    return NextResponse.json({ received: true, id: event.id, ignored: 'unknown eventType' });
  }

  // Respond first (5-second timeout); after() runs the fetch-back once the response is sent.
  after(() => processEvent(event).catch((err) => console.error('Strike event processing failed:', err)));
  return NextResponse.json({ received: true, id: event.id, eventType: event.eventType });
}
