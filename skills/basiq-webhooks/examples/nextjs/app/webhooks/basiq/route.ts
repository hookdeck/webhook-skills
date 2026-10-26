// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Basiq signs webhooks with Standard Webhooks:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

// Basiq notifications are thin: fetch links.event / links.eventEntity for the data.
interface BasiqEvent {
  eventTypeId?: string; // e.g. "connection.activated"
  eventId?: string;
  links?: { event?: string; eventEntity?: string };
  [key: string]: any;
}

type WebhookHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Basiq delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute window), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * The fixed window rejects Hookdeck retries and replays older than 5 minutes
 * (they resend the original timestamp). For a configurable window, see the
 * manual verifier in references/verification.md.
 */
function verifyBasiqWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret = process.env.BASIQ_WEBHOOK_SECRET as string
): BasiqEvent {
  return new Webhook(secret).verify(rawBody, headers) as BasiqEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header.
const processedMessageIds = new Set<string>();

function handleEvent(event: BasiqEvent): void {
  const type = event.eventTypeId;
  const entity = event.links?.eventEntity ?? 'unknown';

  switch (type) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`${type}: ${entity}`);
      break;
    case 'connection.created':
    case 'connection.activated':
    case 'connection.invalidated':
    case 'connection.deleted':
      console.log(`${type}: ${entity}`);
      break;
    case 'consent.created':
    case 'consent.updated':
    case 'consent.warning':
    case 'consent.reminder':
    case 'consent.expired':
    case 'consent.revoked':
      console.log(`${type}: ${entity}`);
      break;
    case 'account.updated':
    case 'transactions.updated':
      console.log(`${type}: ${entity}`);
      break;
    default:
      console.log(`Unhandled Basiq event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BASIQ_WEBHOOK_SECRET) {
    console.error('BASIQ_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: BasiqEvent;
  try {
    event = verifyBasiqWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Basiq webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are possible; acknowledge with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Basiq event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
