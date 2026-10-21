// Generated with: yoco-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Yoco signs webhooks (Yoco API and Checkout API) with Standard Webhooks:
//   webhook-id         unique identifier for the delivery
//   webhook-timestamp  Unix seconds when the delivery was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

// Yoco recommends rejecting timestamps more than 3 minutes from now. The
// standardwebhooks SDK allows 5 minutes, so check the tighter window first.
const TIMESTAMP_TOLERANCE_SECONDS = 3 * 60;

/** Yoco API event: flat payload identified by `event_type`. */
export interface YocoApiEvent {
  event_type: string; // e.g. "payment.created", "order.completed"
  business_id: string;
  order_id?: string;
  payment_id?: string;
  [key: string]: unknown;
}

/** Checkout API event: `type` plus a nested `payload` object. */
export interface YocoCheckoutEvent {
  id: string;
  type: string; // "payment.succeeded" | "payment.failed" | "refund.succeeded" | "refund.failed"
  createdDate: string;
  payload: {
    id: string;
    amount: number; // cents
    currency: string; // "ZAR"
    status: string;
    type: 'payment' | 'refund';
    mode: 'live' | 'test';
    metadata?: { checkoutId?: string; [key: string]: unknown };
    failureReason?: string;
    [key: string]: unknown;
  };
}

export type YocoEvent = YocoApiEvent | YocoCheckoutEvent;

type YocoHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Yoco delivery with the Standard Webhooks SDK (the library Yoco
 * recommends). The SDK recomputes the HMAC over the raw body and compares it
 * in constant time against every `v1,` entry in webhook-signature.
 * Throws if the timestamp is stale or the signature doesn't match.
 */
function verifyYocoWebhook(rawBody: string, headers: YocoHeaders, secret: string): YocoEvent {
  const timestamp = Number(headers['webhook-timestamp']);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new Error('Timestamp outside the 3-minute tolerance');
  }
  return new Webhook(secret).verify(rawBody, headers) as YocoEvent;
}

// In-memory dedupe for the demo. Yoco may deliver an event more than once and
// recommends tracking webhook-id. Use Redis or your database in production.
const processedWebhookIds = new Set<string>();

function handleEvent(event: YocoEvent): void {
  // Yoco API events use `event_type`; Checkout API events use `type`.
  if ('event_type' in event) {
    handleYocoApiEvent(event);
  } else {
    handleCheckoutEvent(event);
  }
}

function handleYocoApiEvent(event: YocoApiEvent): void {
  const eventType = event.event_type;
  switch (eventType) {
    case 'payment.created':
      // Fetch full details with GET /v1/payments/{payment_id} if you need them.
      console.log(`Payment ${event.payment_id} created for order ${event.order_id}`);
      break;
    case 'payment.refunded':
      console.log(`Payment ${event.payment_id} refunded (order ${event.order_id})`);
      break;
    case 'order.created':
    case 'order.updated':
    case 'order.completed':
    case 'order.cancelled':
      console.log(`${eventType}: order ${event.order_id} (business ${event.business_id})`);
      break;
    case 'item.created':
    case 'item.updated':
    case 'item.deleted':
    case 'item_category.created':
    case 'item_category.updated':
    case 'item_category.deleted':
      console.log(`${eventType} (business ${event.business_id})`);
      break;
    default:
      console.log(`Unhandled Yoco event type: ${eventType}`);
  }
}

function handleCheckoutEvent(event: YocoCheckoutEvent): void {
  const { payload } = event;
  // Every account-wide payment arrives here; match payload.metadata.checkoutId
  // against the checkout you created before fulfilling anything.
  switch (event.type) {
    case 'payment.succeeded':
      console.log(
        `Checkout ${payload?.metadata?.checkoutId} paid: ` +
          `${payload?.amount} ${payload?.currency} (${payload?.id})`
      );
      break;
    case 'payment.failed':
      console.log(`Checkout ${payload?.metadata?.checkoutId} payment failed`);
      break;
    case 'refund.succeeded':
      console.log(`Refund ${payload?.id} succeeded: ${payload?.amount} cents`);
      break;
    case 'refund.failed':
      console.log(`Refund ${payload?.id} failed: ${payload?.failureReason}`);
      break;
    default:
      console.log(`Unhandled Yoco event type: ${event.type}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('YOCO_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body — request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: YocoEvent;
  try {
    event = verifyYocoWebhook(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      },
      secret
    );
  } catch (err) {
    console.error('Yoco webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedWebhookIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Yoco needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedWebhookIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Yoco event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
