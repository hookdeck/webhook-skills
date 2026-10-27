// Generated with: speed-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Speed (tryspeed.com) signs webhooks with Standard Webhooks:
//   webhook-id         the delivery ID (new on every retry)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its prefix. Speed shows the
// secret as `wsec_<base64>`; the library only strips `whsec_`, so swap the prefix.
// ---------------------------------------------------------------------------

interface SpeedEvent {
  id: string; // evt_..., unique per event and the same on every retry
  object: string; // always "events"
  api_version: string;
  event_type: string; // e.g. "payment.paid"
  data: { object?: Record<string, any>; account_id?: string; [key: string]: any };
  livemode: boolean;
  request?: { id: string };
  created: number;
  modified: number;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Speed shows the secret with a wsec_ prefix. The standardwebhooks library
 * only understands whsec_, so turn a leading wsec_ into whsec_.
 */
function toStandardSecret(secret: string): string {
  return secret.startsWith('wsec_') ? `whsec_${secret.slice('wsec_'.length)}` : secret;
}

/**
 * Read the signature headers. Standard Webhooks uses webhook-*; when
 * webhook-id is absent, fall back to the svix-* names, as Hookdeck does.
 * Returns them under the webhook-* names the library expects.
 */
function readSignatureHeaders(get: (name: string) => string | null): Partial<SignatureHeaders> {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`) ?? undefined,
    'webhook-timestamp': get(`${prefix}-timestamp`) ?? undefined,
    'webhook-signature': get(`${prefix}-signature`) ?? undefined,
  };
}

/**
 * Verify a Speed delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 */
function verifySpeedWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SPEED_WEBHOOK_SECRET as string
): SpeedEvent {
  return new Webhook(toStandardSecret(secret)).verify(rawBody, headers) as SpeedEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Speed re-signs retries with a NEW webhook-id, so dedupe on the event `id` (evt_...).
const processedEventIds = new Set<string>();

function handleEvent(event: SpeedEvent): void {
  const type = event.event_type;
  const data = event.data ?? {};
  const obj = data.object ?? {};

  switch (type) {
    // --- Payments ----------------------------------------------------------
    case 'payment.created':
    case 'payment.paid':
    case 'payment.confirmed':
    case 'payment.expired':
    case 'payment.cancelled':
      console.log(`${type}: ${obj.id} (${obj.amount} ${obj.currency}, status=${obj.status})`);
      break;

    // --- Checkout sessions and links ---------------------------------------
    case 'checkout_session.created':
    case 'checkout_session.paid':
    case 'checkout_session.payment_paid':
    case 'checkout_session.deactivated':
    case 'checkout_link.created':
    case 'checkout_link.paid':
    case 'checkout_link.deactivated':
      console.log(`${type}: ${obj.id} (status=${obj.status})`);
      break;

    // --- Payment links, addresses, payrequests, invoices -------------------
    case 'payment_link.created':
    case 'payment_link.paymentreceived':
    case 'payment_link.deactivated':
    case 'payment_address.paymentreceived':
    case 'payrequest.payment_paid':
    case 'invoice.paid':
      console.log(`${type}: ${obj.id}`);
      break;

    // --- Withdrawals -------------------------------------------------------
    case 'withdraw.created':
    case 'withdraw.paid':
    case 'withdraw.failed':
    case 'withdrawal_link.created':
    case 'withdrawal_link.paid':
    case 'withdrawal_link.deactivated':
    case 'withdraw_request.created':
    case 'withdraw_request.paid':
    case 'withdraw_request.deactivated':
      console.log(`${type}: ${obj.id} (status=${obj.status})`);
      break;

    // --- Connect (events for connected accounts carry data.account_id) -----
    case 'connect.completed':
      console.log(`${type}: ${obj.id ?? data.account_id}`);
      break;

    default:
      // Speed's event list may grow: acknowledge, don't fail.
      console.log(`Unhandled Speed event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SPEED_WEBHOOK_SECRET) {
    console.error('SPEED_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = readSignatureHeaders((name) => request.headers.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json(
      { error: 'Missing Standard Webhooks signature headers' },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SpeedEvent;
  try {
    event = verifySpeedWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Speed webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries get a new webhook-id but keep the event id; acknowledge duplicates with 200.
  const eventId = event.id || (headers['webhook-id'] as string);
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Reply 2xx quickly: any other status is retried. In production, enqueue the
    // event here and process it asynchronously. Compare event.modified before
    // overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Speed event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
