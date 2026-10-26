// Generated with: sent-dm-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Sent (sent.dm) signs webhooks Standard Webhooks / Svix style, but on
// X-Webhook-* header names:
//   X-Webhook-ID         UUID of the webhook configuration (the SAME on every
//                        event, so it is signed but is NOT a dedupe key)
//   X-Webhook-Timestamp  Unix seconds at which this attempt was signed
//   X-Webhook-Signature  "v1,<base64 HMAC-SHA256>" (space-delimited if several)
//   X-Webhook-Event-ID   the event's own UUID, identical on every attempt
// Signed content: `${X-Webhook-ID}.${X-Webhook-Timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface SentEvent {
  field: string; // parent type: message, templates, channel, contact, link, call
  event: string; // e.g. "message.delivered"
  timestamp: string;
  payload: Record<string, any>;
}

/**
 * Verify a Sent delivery with the Standard Webhooks library. The library reads
 * webhook-* header names, so map Sent's x-webhook-* headers onto them. It
 * rejects timestamps more than 5 minutes off, recomputes the HMAC over the raw
 * body and compares in constant time against every `v1,` entry.
 */
function verifySentWebhook(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  secret = process.env.SENT_WEBHOOK_SECRET as string
): SentEvent {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers.id,
    'webhook-timestamp': headers.timestamp,
    'webhook-signature': headers.signature,
  }) as SentEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Sent delivers at-least-once; X-Webhook-Event-ID is the same on every attempt.
const processedEventIds = new Set<string>();

function handleEvent(event: SentEvent): void {
  const { event: type, payload = {} } = event; // dispatch on the body's `event` field

  switch (type) {
    case 'message.delivered':
      console.log(`Message delivered: ${payload.message_id} to ${payload.outbound_number} (${payload.channel})`);
      break;
    case 'message.failed':
      console.log(`Message failed: ${payload.message_id} (${payload.reason_code}: ${payload.reason})`);
      break;
    case 'message.received':
      console.log(`Inbound message from ${payload.inbound_number}: ${payload.text}`);
      break;
    case 'templates.approved':
    case 'templates.rejected':
      console.log(`Template ${payload.template_name} ${payload.status}`);
      break;
    case 'contact.opt_out':
      console.log(`Contact opted out: ${payload.contact_id} (${payload.source})`);
      break;
    case 'channel.activated':
      console.log(`Channel activated: ${payload.channel} sender ${payload.sender_value}`);
      break;

    default:
      // Sent documents 38 event types and adds more over time. Acknowledge the rest.
      console.log(`Unhandled Sent event: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SENT_WEBHOOK_SECRET) {
    console.error('SENT_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'no signing secret configured' }, { status: 503 });
  }

  const id = request.headers.get('x-webhook-id');
  const timestamp = request.headers.get('x-webhook-timestamp');
  const signature = request.headers.get('x-webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  // arrayBuffer() reads the exact bytes whatever the Content-Type is.
  const rawBody = new TextDecoder().decode(await request.arrayBuffer());

  let event: SentEvent;
  try {
    event = verifySentWebhook(rawBody, { id, timestamp, signature });
  } catch (err) {
    console.error('Sent webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // Dedupe on the event's own id, NOT x-webhook-id (that is the webhook's id).
  const eventId = request.headers.get('x-webhook-event-id');
  if (eventId && processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Sent waits up to 30 s by default (5-120 s per webhook) for a 2xx, and
    // disables a webhook after 10 consecutive failures. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Sent event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
