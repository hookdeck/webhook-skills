import { NextRequest, NextResponse } from 'next/server';
import { verifyFourthwallSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body: the signature covers the exact bytes received
  const body = await request.text();
  const signature = request.headers.get('x-fourthwall-hmac-sha256');

  // Verify webhook signature
  if (!verifyFourthwallSignature(body, signature, process.env.FOURTHWALL_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = event.data ?? {};
  console.log(`Received ${event.type} (${event.id})${event.testMode ? ' [test]' : ''}`);

  // Handle the event based on type. Delivery is at-least-once,
  // so deduplicate on event.id before doing real work.
  switch (event.type) {
    case 'ORDER_PLACED':
      console.log('New order:', data.friendlyId);
      // TODO: Start fulfilment, record the sale, etc.
      break;

    case 'ORDER_UPDATED':
      console.log('Order updated:', data.order?.friendlyId);
      // TODO: Sync order status or shipping address
      break;

    case 'GIFT_PURCHASE':
      console.log('Gift purchase:', data.friendlyId);
      // TODO: Deliver or track gift redemptions
      break;

    case 'DONATION':
      console.log('Donation from:', data.username);
      // TODO: Send thanks, trigger a stream alert, etc.
      break;

    case 'SUBSCRIPTION_PURCHASED':
      console.log('New subscription:', data.id);
      // TODO: Grant membership access
      break;

    case 'SUBSCRIPTION_CHANGED':
      console.log('Subscription changed:', data.id);
      // TODO: Update entitlements for the new tier
      break;

    case 'SUBSCRIPTION_EXPIRED':
      console.log('Subscription expired:', data.id);
      // TODO: Revoke membership access
      break;

    case 'PRODUCT_CREATED':
      console.log('Product created:', data.name);
      // TODO: Add to external catalog
      break;

    case 'PRODUCT_UPDATED':
      console.log('Product updated:', data.name);
      // TODO: Update external catalog
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 quickly (Fourthwall expects a reply within 2 seconds)
  return NextResponse.json({ received: true });
}
