import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Shopify webhook signature
 */
function verifyShopifyWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256');
  const topic = request.headers.get('x-shopify-topic');
  const shop = request.headers.get('x-shopify-shop-domain');

  // Verify webhook signature
  if (!hmac || !verifyShopifyWebhook(body, hmac, process.env.SHOPIFY_API_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);

  console.log(`Received ${topic} webhook from ${shop}`);

  // Handle the event based on topic
  switch (topic) {
    case 'orders/create':
      console.log('New order:', payload.id);
      // TODO: Process new order, sync to fulfillment, etc.
      break;

    case 'orders/updated':
      console.log('Order updated:', payload.id);
      // TODO: Update order status, sync changes, etc.
      break;

    case 'orders/paid':
      console.log('Order paid:', payload.id);
      // TODO: Trigger fulfillment, record payment, etc.
      break;

    case 'products/create':
      console.log('New product:', payload.id);
      // TODO: Sync to external catalog, etc.
      break;

    case 'products/update':
      console.log('Product updated:', payload.id);
      // TODO: Update external listings, etc.
      break;

    case 'customers/create':
      console.log('New customer:', payload.id);
      // TODO: Welcome email, CRM sync, etc.
      break;

    case 'app/uninstalled':
      console.log('App uninstalled from shop:', shop);
      // TODO: Cleanup shop data, etc.
      break;

    // GDPR mandatory webhooks
    case 'customers/data_request':
      console.log('Customer data request for shop:', shop);
      // TODO: Gather and return customer data
      break;

    case 'customers/redact':
      console.log('Customer redact request for shop:', shop);
      // TODO: Delete customer data
      break;

    case 'shop/redact':
      console.log('Shop redact request for shop:', shop);
      // TODO: Delete all shop data
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
