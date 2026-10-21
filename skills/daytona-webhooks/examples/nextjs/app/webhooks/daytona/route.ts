// Generated with: daytona-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Daytona's webhook docs don't describe signing. Deliveries go through Svix:
//   svix-id         message ID (same on retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

type DaytonaEvent = {
  event: string; // e.g. "sandbox.state.updated"
  timestamp: string; // ISO 8601
  [key: string]: any; // flat event fields: id, name, organizationId, state, oldState, newState, ...
};

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify a Daytona delivery with the official Svix library. Svix checks the
 * timestamp (5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyDaytonaWebhook(rawBody: string, headers: SvixHeaders, secret: string): DaytonaEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as DaytonaEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The payload has no event ID, so dedupe on svix-id (stable across retries).
const processedMessageIds = new Set<string>();

function handleEvent(payload: DaytonaEvent): void {
  switch (payload.event) {
    case 'sandbox.created':
      console.log(`Sandbox ${payload.id} created in org ${payload.organizationId} (${payload.sandboxClass}, ${payload.state})`);
      break;
    case 'sandbox.state.updated':
      console.log(`Sandbox ${payload.id}: ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.created':
      console.log(`Snapshot ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'snapshot.state.updated':
      console.log(`Snapshot ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.removed':
      console.log(`Snapshot ${payload.name} (${payload.id}) removed at ${payload.removedAt}`);
      break;
    case 'volume.created':
      console.log(`Volume ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'volume.state.updated':
      console.log(`Volume ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    default:
      console.log(`Unhandled Daytona event: ${payload.event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.DAYTONA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DAYTONA_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // request.text() gives the exact bytes Daytona sent; request.json() would break the HMAC.
  const rawBody = await request.text();

  let payload: DaytonaEvent;
  try {
    payload = verifyDaytonaWebhook(
      rawBody,
      { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature },
      secret
    );
  } catch (err) {
    console.error('Daytona webhook verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Daytona event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
