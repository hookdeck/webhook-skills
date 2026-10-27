// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Basiq signs webhooks with the Standard Webhooks scheme:
//   webhook-id         unique message ID (same if the message is resent)
//   webhook-timestamp  Unix seconds of the attempt
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each Basiq webhook subscription has its own signing secret.
// ---------------------------------------------------------------------------

// Basiq notifications are thin: fetch the event or the affected object from
// links.event / links.eventEntity with your Basiq API token to get the data.
interface BasiqEvent {
  eventTypeId: string; // e.g. "user.created"
  eventId: string;
  links?: { event?: string; eventEntity?: string };
}

interface SignatureHeaders {
  'webhook-id': string;
  'webhook-timestamp': string;
  'webhook-signature': string;
}

/**
 * Pick the header set. Hookdeck's Basiq source reads webhook-* and falls back
 * to svix-* when webhook-id is absent; do the same, then hand the library the
 * values under the webhook-* names it expects.
 */
function signatureHeaders(headers: Headers): Partial<SignatureHeaders> {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`) ?? undefined,
    'webhook-timestamp': headers.get(`${prefix}-timestamp`) ?? undefined,
    'webhook-signature': headers.get(`${prefix}-signature`) ?? undefined,
  };
}

/**
 * Verify a Basiq delivery with the Standard Webhooks library. It enforces a
 * fixed 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. Hookdeck retries and
 * replays resend the ORIGINAL timestamp, so late ones fail here; see
 * references/verification.md for a manual verifier with a configurable window.
 */
function verifyBasiqWebhook(rawBody: string, headers: SignatureHeaders, secret: string): void {
  new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id stays the same if Basiq resends a message.
const processedMessageIds = new Set<string>();

function handleEvent(event: BasiqEvent): void {
  const { eventTypeId, eventId, links = {} } = event;

  switch (eventTypeId) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'connection.created':
    case 'connection.activated':
    case 'connection.invalidated':
    case 'connection.deleted':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'consent.created':
    case 'consent.updated':
    case 'consent.revoked':
    case 'consent.expired':
    case 'consent.reminder':
    case 'consent.warning':
      console.log(`${eventTypeId}: ${links.eventEntity} (event ${eventId})`);
      break;

    case 'account.updated':
      console.log(`Account updated: ${links.eventEntity} (event ${eventId})`);
      break;
    case 'transactions.updated':
      console.log(`Transactions updated: ${links.eventEntity} (event ${eventId})`);
      break;

    default:
      console.log(`Unhandled Basiq event type: ${eventTypeId}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.BASIQ_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BASIQ_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  try {
    verifyBasiqWebhook(rawBody, headers as SignatureHeaders, secret);
  } catch (err) {
    console.error('Basiq webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Verified: only now parse the body.
  let event: BasiqEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // A resent message reuses the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Basiq event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
