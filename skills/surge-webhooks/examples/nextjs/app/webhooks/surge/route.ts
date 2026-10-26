// Generated with: surge-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Surge delivers webhooks with Standard Webhooks signatures:
//   webhook-id         unique id for the delivery
//   webhook-timestamp  Unix seconds when the event was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Hookdeck's Surge source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
// ---------------------------------------------------------------------------

interface SurgeEvent {
  id?: string; // some of Surge's examples omit it
  type: string; // e.g. "message.received"
  timestamp?: string;
  account_id?: string;
  data?: {
    id?: string;
    body?: string;
    failure_reason?: string;
    conversation?: { id?: string };
    campaign?: { attachment_status?: string };
    message?: { id?: string };
    [key: string]: unknown;
  };
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
 * Verify a Surge delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifySurgeWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SURGE_WEBHOOK_SECRET as string
): SurgeEvent {
  return new Webhook(secret).verify(rawBody, headers) as SurgeEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Fall back to type + data.id when the envelope has no id.
const processedEventKeys = new Set<string>();

function eventKey(event: SurgeEvent): string | null {
  if (event.id) return event.id;
  return event.data?.id ? `${event.type}:${event.data.id}` : null;
}

function handleEvent(event: SurgeEvent): void {
  const { type } = event;
  const data = event.data ?? {};

  switch (type) {
    // --- Messages ----------------------------------------------------------
    case 'message.received':
      // Reply with POST /accounts/{account_id}/messages and conversation.id.
      console.log(`Inbound message ${data.id} in ${data.conversation?.id}: ${data.body}`);
      break;
    case 'message.sent':
      console.log(`Message sent to carrier: ${data.id}`);
      break;
    case 'message.delivered':
      console.log(`Message delivered: ${data.id}`);
      break;
    case 'message.failed':
      // opted_out and invalid_mobile_number are permanent; carrier_error is transient.
      console.log(`Message failed: ${data.id} (${data.failure_reason})`);
      break;

    // --- Contacts and conversations ----------------------------------------
    case 'contact.opted_in':
      console.log(`Contact opted in: ${data.id}`);
      break;
    case 'contact.opted_out':
      // Suppress this contact in your own systems.
      console.log(`Contact opted out: ${data.id}`);
      break;
    case 'conversation.created':
      console.log(`Conversation created: ${data.id}`);
      break;

    // --- Campaigns and phone numbers ---------------------------------------
    case 'campaign.approved':
      console.log(`Campaign approved: ${data.id}`);
      break;
    case 'phone_number.imported':
      console.log(`Phone number imported: ${data.id} (${data.campaign?.attachment_status ?? 'no campaign'})`);
      break;
    case 'phone_number.attached_to_campaign':
      console.log(`Phone number attached to campaign: ${data.id}`);
      break;

    // --- Links -------------------------------------------------------------
    case 'link.followed':
      // data.message_id is deprecated; use data.message.id.
      console.log(`Link followed in message ${data.message?.id}`);
      break;

    // --- Voice -------------------------------------------------------------
    case 'call.ended':
      console.log(`Call ended: ${data.id}`);
      break;
    case 'recording.completed':
    case 'voicemail.received':
      // Download the audio with GET /recordings/{recording_id}/file.
      console.log(`${type}: ${data.id}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Surge event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SURGE_WEBHOOK_SECRET) {
    console.error('SURGE_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SurgeEvent;
  try {
    event = verifySurgeWebhook(rawBody, headers);
  } catch (err) {
    console.error('Surge webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const key = eventKey(event);
  if (key && processedEventKeys.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Return 2xx quickly. In production, enqueue the event here and process
    // it asynchronously.
    handleEvent(event);
    if (key) processedEventKeys.add(key);
  } catch (err) {
    console.error('Error handling Surge event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
