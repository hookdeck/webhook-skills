// Generated with: beehiiv-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// beehiiv delivers webhooks through Svix:
//   svix-id         unique message ID (same on retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface BeehiivEvent {
  uid: string;
  event_type: string; // e.g. "subscription.created"
  event_timestamp: number; // seconds since the Unix epoch
  data: Record<string, any>;
}

/**
 * Verify with the official `svix` library, then parse. The library always enforces a
 * 5-minute timestamp window; Hookdeck retries and replays resend the original svix-timestamp,
 * so they are rejected once older than that. references/verification.md has a manual verifier
 * where the window can be dropped or widened.
 */
function verifyBeehiivWebhook(rawBody: string, headers: Record<string, string>, secret: string): BeehiivEvent {
  new Webhook(secret).verify(rawBody, headers); // throws on failure; 2.x returns nothing
  return JSON.parse(rawBody) as BeehiivEvent; // parse only after the signature check
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set<string>();

function handleEvent(event: BeehiivEvent): void {
  const { event_type: type, data = {} } = event;

  switch (type) {
    case 'post.sent':
    case 'post.updated':
    case 'post.scheduled':
      console.log(`${type}: post ${data.id ?? data.post_id ?? '(unknown id)'}`);
      break;
    case 'subscription.created':
    case 'subscription.confirmed':
    case 'subscription.deleted':
    case 'subscription.upgraded':
    case 'subscription.downgraded':
    case 'subscription.paused':
    case 'subscription.resumed':
      console.log(`${type}: ${data.email ?? data.id ?? '(unknown subscriber)'}`);
      break;
    case 'newsletter_list_subscription.subscribed':
      console.log(`List subscription: ${JSON.stringify(data)}`);
      break;
    case 'survey.response_submitted':
      console.log(`Survey response submitted: ${JSON.stringify(data)}`);
      break;
    case 'podcasts.episode.published':
      console.log(`Podcast episode published: ${JSON.stringify(data)}`);
      break;
    default:
      console.log(`Unhandled beehiiv event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.BEEHIIV_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BEEHIIV_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: BeehiivEvent;
  try {
    event = verifyBeehiivWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('beehiiv webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery); acknowledge with 200.
  const eventId = event.uid ?? svixId;
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling beehiiv event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
