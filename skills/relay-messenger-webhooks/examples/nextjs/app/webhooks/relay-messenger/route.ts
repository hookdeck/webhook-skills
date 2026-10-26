// Generated with: relay-messenger-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Relay delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique event identifier
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the subscription's secret after its `whsec_` prefix.
// Each webhook subscription has its own signing secret.
// Hookdeck's Relay source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
// ---------------------------------------------------------------------------

interface RelayEvent {
  api_version: string;
  webhook_version: string;
  event_type: string; // e.g. "message.received"
  event_id: string; // dedupe key, same on every retry
  created_at: string;
  trace_id: string;
  agent_id: string;
  data: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a Relay delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifyRelayWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.RELAY_MESSENGER_WEBHOOK_SECRET as string
): RelayEvent {
  return new Webhook(secret).verify(rawBody, headers) as RelayEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// event_id is the same on every retry and on every subscription.
const processedEventIds = new Set<string>();

function handleEvent(event: RelayEvent): void {
  const { event_type: type, data = {} } = event;

  switch (type) {
    // --- Messages ----------------------------------------------------------
    case 'message.received':
      // Inbound message from a person or another agent. parts[] holds the content.
      console.log(
        `Message ${data.id} received in chat ${data.chat_id} from ${data.from_handle?.handle} (${data.from_handle?.kind})`
      );
      break;
    case 'message.sent':
      console.log(`Message ${data.id} sent in chat ${data.chat_id}`);
      break;
    case 'message.delivered':
    case 'message.read':
      console.log(`${type}: message ${data.id}`);
      break;
    case 'message.failed':
      // Fires when the recipient agent's message.received webhook went terminal.
      // code, reason and detail_code are useful for support requests; don't branch on detail_code.
      console.log(`Message ${data.message_id} failed (code ${data.code}): ${data.reason}`);
      break;

    // --- Reactions ---------------------------------------------------------
    case 'reaction.added':
    case 'reaction.removed':
      console.log(
        `${type}: ${data.reaction_type} on message ${data.message_id} from ${data.from_handle?.handle}`
      );
      break;

    // --- Chats and participants -------------------------------------------
    case 'chat.created':
      console.log(`Chat created: ${data.id} (group: ${data.is_group})`);
      break;
    case 'participant.added':
    case 'participant.removed':
      console.log(`${type}: ${data.participant?.handle} in chat ${data.chat_id}`);
      break;

    default:
      // Relay documents 27 event types; subscribe only to the ones you handle.
      console.log(`Unhandled Relay event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.RELAY_MESSENGER_WEBHOOK_SECRET) {
    console.error('RELAY_MESSENGER_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: RelayEvent;
  try {
    event = verifyRelayWebhook(rawBody, headers);
  } catch (err) {
    console.error('Relay webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const eventId = event.event_id;
  if (eventId && processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Relay waits 10 seconds per attempt. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Relay event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
