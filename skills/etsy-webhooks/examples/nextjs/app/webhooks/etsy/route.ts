// Generated with: etsy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';

// Etsy notification payloads are thin; fetch resource_url with your OAuth token for full data
interface EtsyWebhookEvent {
  event_type: string;
  resource_url: string;
  shop_id: string | number;
  listing_id?: string | number;
  product_id?: string | number;
}

function verificationErrorMessage(err: unknown): string {
  if (!(err instanceof WebhookVerificationError)) return 'Webhook verification failed';
  if (err.message === 'No matching signature found') return 'Invalid signature';
  if (err.message.startsWith('Message timestamp')) return 'Timestamp outside tolerance';
  return err.message;
}

function handleEvent(event: EtsyWebhookEvent) {
  switch (event.event_type) {
    case 'order.paid':
      console.log('Order paid:', event.shop_id, event.resource_url);
      break;
    case 'order.canceled':
      console.log('Order canceled:', event.shop_id, event.resource_url);
      break;
    case 'order.shipped':
      console.log('Order shipped:', event.shop_id, event.resource_url);
      break;
    case 'order.delivered':
      console.log('Order delivered:', event.shop_id, event.resource_url);
      break;
    case 'listing.created':
    case 'listing.updated':
    case 'listing.deleted':
      console.log(`${event.event_type}:`, event.listing_id);
      break;
    case 'inventory.created':
    case 'inventory.updated':
    case 'inventory.deleted':
      console.log(`${event.event_type}:`, event.listing_id, event.product_id);
      break;
    case 'inventory.out_of_stock':
      console.log('Product out of stock:', event.listing_id, event.product_id);
      break;
    default:
      console.log('Unhandled event type:', event.event_type);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ETSY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('ETSY_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)' },
      { status: 400 }
    );
  }

  // Raw body: verification must run on the exact text Etsy signed
  const body = await request.text();

  let event: EtsyWebhookEvent;
  try {
    event = new Webhook(secret).verify(body, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }) as EtsyWebhookEvent;
  } catch (err) {
    console.error('Etsy webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: verificationErrorMessage(err) }, { status: 400 });
  }

  // webhook-id is stable across retries: use it as your idempotency key
  console.log(`Received Etsy webhook ${webhookId}: ${event.event_type}`);
  handleEvent(event);

  return NextResponse.json({ received: true, event_type: event.event_type });
}
