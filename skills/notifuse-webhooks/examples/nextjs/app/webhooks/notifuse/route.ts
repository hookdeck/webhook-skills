// Generated with: notifuse-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Notifuse signs webhooks per Standard Webhooks:
//   webhook-id         unique delivery ID
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the subscription's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface NotifuseEvent {
  id: string; // delivery_...
  type: string; // e.g. "contact.created"
  timestamp: string; // ISO 8601
  workspace_id: string;
  data: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers. Notifuse sends webhook-*; if webhook-id is
 * absent, fall back to the svix-* names (what Hookdeck does too). The result
 * always uses the webhook-* names the standardwebhooks library expects.
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
 * Verify a delivery with the Standard Webhooks library. It enforces a fixed
 * 5-minute timestamp window, recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry. Hookdeck retries and
 * replays resend the original timestamp, so late retries fail the window; see
 * references/verification.md for a manual verifier without it.
 */
function verifyNotifuseWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.NOTIFUSE_WEBHOOK_SECRET as string
): NotifuseEvent {
  return new Webhook(secret).verify(rawBody, headers) as NotifuseEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header: Notifuse may rarely deliver twice.
const processedDeliveryIds = new Set<string>();

function handleEvent(event: NotifuseEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    // --- Contacts ----------------------------------------------------------
    case 'contact.created':
    case 'contact.updated':
    case 'contact.deleted':
      console.log(`${type}: ${data.email} (${data.id})`);
      break;

    // --- Lists (one delivery per contact per list event) -------------------
    case 'list.subscribed':
    case 'list.unsubscribed':
    case 'list.confirmed':
    case 'list.resubscribed':
    case 'list.bounced':
    case 'list.complained':
    case 'list.pending':
    case 'list.removed':
      console.log(`${type}: ${data.email}`);
      break;

    // --- Segments ----------------------------------------------------------
    case 'segment.joined':
    case 'segment.left':
      console.log(`${type}: ${data.email} / ${data.segment_name} (${data.segment_id})`);
      break;

    // --- Emails ------------------------------------------------------------
    case 'email.sent':
    case 'email.delivered':
    case 'email.opened':
    case 'email.clicked':
    case 'email.bounced':
    case 'email.complained':
    case 'email.unsubscribed':
      console.log(`${type}: ${data.message_id} to ${data.email} ("${data.subject}")`);
      break;

    // --- Custom events -----------------------------------------------------
    case 'custom_event.created':
    case 'custom_event.updated':
    case 'custom_event.deleted':
      console.log(`${type}: ${JSON.stringify(data)}`);
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Notifuse event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.NOTIFUSE_WEBHOOK_SECRET) {
    console.error('NOTIFUSE_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: NotifuseEvent;
  try {
    event = verifyNotifuseWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Notifuse webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Notifuse needs a 2xx within 30 seconds. In production, enqueue the
    // event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Notifuse event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
