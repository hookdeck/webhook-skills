import { NextRequest, NextResponse } from 'next/server';
import { getShopSecret, verifyShopwareWebhook } from '../../../lib/shopware';

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification (any content type)
  const body = await request.text();
  const signature = request.headers.get('shopware-shop-signature');

  // Parse only to find which shop sent this; nothing is trusted until verified
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const shopId: string | undefined = payload?.source?.shopId;
  if (!shopId) {
    return NextResponse.json({ error: 'Missing source.shopId' }, { status: 400 });
  }

  if (!verifyShopwareWebhook(body, signature, getShopSecret(shopId))) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event: string | undefined = payload.data?.event;
  const eventId: string | undefined = payload.source.eventId; // stable across retries: use for idempotency
  console.log(`Received ${event} event from shop ${shopId} (eventId: ${eventId})`);

  switch (event) {
    case 'checkout.order.placed':
      console.log('Order placed:', JSON.stringify(payload.data.payload));
      // TODO: Fulfilment, ERP sync, etc.
      break;

    case 'product.written':
      console.log('Product written:', JSON.stringify(payload.data.payload));
      // TODO: Fetch the product by primaryKey via the Admin API and sync it
      break;

    case 'order.written':
      console.log('Order written:', JSON.stringify(payload.data.payload));
      // TODO: Fetch the order by primaryKey and sync it
      break;

    case 'customer.written':
      console.log('Customer written:', JSON.stringify(payload.data.payload));
      // TODO: Fetch the customer by primaryKey and sync to CRM
      break;

    case 'state_enter.order.state.completed':
      console.log('Order completed:', JSON.stringify(payload.data.payload));
      // TODO: Send notifications, invoicing, etc.
      break;

    case 'state_enter.order_transaction.state.paid':
      console.log('Order transaction paid:', JSON.stringify(payload.data.payload));
      // TODO: Release goods, mark as paid, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
