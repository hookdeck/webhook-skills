// Generated with: agntix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Agntix delivers webhooks through Svix:
//   svix-id         message ID
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

// Flat envelope (no `data`). `eventType` is the event; `type` is VOICE | CHAT.
interface AgntixEvent {
  id: string; // session UUID, shared by session.created and session.ended
  eventType: string; // "session.created" | "session.ended"
  type?: string;
  platform?: string;
  direction?: string;
  state?: string;
  agentId?: string;
  createdAt?: string;
  endedAt?: string;
  metadata?: { sessionVariables?: Record<string, unknown>; [key: string]: unknown };
  analysis?: { summary?: string; [key: string]: unknown };
  recordingUrl?: string;
  [key: string]: unknown;
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify an Agntix delivery with the official Svix library. Svix checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 *
 * Hookdeck retries and replays resend the ORIGINAL timestamp, so this library
 * check rejects deliveries retried after 5 minutes. To drop or widen the
 * window, use the manual verifier in references/verification.md.
 */
function verifyAgntixWebhook(rawBody: string, headers: SvixHeaders, secret: string): AgntixEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as AgntixEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The top-level `id` is the SESSION UUID and is shared by session.created and
// session.ended, so the key combines eventType and id.
const processedEvents = new Set<string>();

function handleEvent(event: AgntixEvent): void {
  switch (event.eventType) {
    case 'session.created': {
      // Fires when the session is initiated (for outbound calls: before pickup).
      const vars = event.metadata?.sessionVariables ?? {};
      console.log(
        `Session created: ${event.id} (${event.type}/${event.platform}/${event.direction}) ` +
          `agent ${event.agentId}, variables ${JSON.stringify(vars)}`
      );
      break;
    }
    case 'session.ended': {
      // Fires once when the session closes, with the post-call analysis attached.
      console.log(
        `Session ended: ${event.id} at ${event.endedAt}. ` +
          `Summary: ${event.analysis?.summary ?? 'n/a'}. Recording: ${event.recordingUrl ?? 'n/a'}`
      );
      break;
    }
    default:
      console.log(`Unhandled Agntix event type: ${event.eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.AGNTIX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AGNTIX_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  const rawBody = await request.text();

  let event: AgntixEvent;
  try {
    event = verifyAgntixWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('Agntix webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  const dedupeKey = `${event.eventType}:${event.id}`;
  if (processedEvents.has(dedupeKey)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Agntix needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEvents.add(dedupeKey);
  } catch (err) {
    console.error('Error handling Agntix event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
