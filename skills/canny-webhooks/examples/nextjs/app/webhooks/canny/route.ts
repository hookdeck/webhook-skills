// Generated with: canny-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Canny signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique message ID
//   webhook-timestamp  Unix seconds, covered by the signature
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// The legacy canny-timestamp / canny-nonce / canny-signature headers are
// being removed and don't cover the body: they are ignored here.
// ---------------------------------------------------------------------------

interface CannyEvent {
  created: string; // ISO 8601
  type: string; // e.g. "post.created"
  objectType: string; // e.g. "post"
  object: Record<string, any>;
}

type WebhookHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Canny delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body and compares in constant time against every
 * `v1,` entry (two during the 24h after a secret rotation).
 *
 * NOTE: the library always enforces a 5-minute timestamp window. Hookdeck
 * retries and replays resend the original webhook-timestamp, so a delivery
 * retried later than that is rejected. See references/verification.md for a
 * manual verifier with a configurable window.
 */
function verifyCannyWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret = process.env.CANNY_WEBHOOK_SECRET as string
): CannyEvent {
  return new Webhook(secret).verify(rawBody, headers) as CannyEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Canny bodies carry no event ID, so dedupe on the webhook-id header.
const processedMessageIds = new Set<string>();

function handleEvent(event: CannyEvent): void {
  const { type, objectType, object = {} } = event;

  switch (type) {
    // --- Posts -------------------------------------------------------------
    case 'post.created':
      console.log(`Post created: "${object.title}" on ${object.board?.name} (${object.id})`);
      break;
    case 'post.edited':
      console.log(`Post edited: ${object.id}`);
      break;
    case 'post.deleted':
      console.log(`Post deleted: ${object.id}`);
      break;
    case 'post.status_changed':
      console.log(`Post ${object.id} status changed to "${object.status}"`);
      break;
    case 'post.tag_added':
    case 'post.tag_removed':
      console.log(`${type}: ${object.id}`);
      break;
    case 'post.jira_issue_linked':
    case 'post.jira_issue_unlinked':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Comments ----------------------------------------------------------
    case 'comment.created':
    case 'comment.edited':
    case 'comment.deleted':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Votes -------------------------------------------------------------
    case 'vote.created':
    case 'vote.deleted':
      console.log(`${type}: ${object.id}`);
      break;

    default:
      console.log(`Unhandled Canny event type: ${type} (${objectType})`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CANNY_WEBHOOK_SECRET) {
    console.error('CANNY_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC. Reading
  // the text works for any content type.
  const rawBody = await request.text();

  let event: CannyEvent;
  try {
    event = verifyCannyWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Canny webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Canny event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
