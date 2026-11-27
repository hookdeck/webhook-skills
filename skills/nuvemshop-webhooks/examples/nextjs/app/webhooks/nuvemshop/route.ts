// Generated with: nuvemshop-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Nuvemshop (Tiendanube) webhook signature.
 *
 * HMAC-SHA256 over the raw request body, keyed on the app's client secret,
 * hex-encoded, sent in the x-linkedstore-hmac-sha256 header.
 */
function verifyNuvemshopWebhook(rawBody: string, hmacHeader: string | null, clientSecret: string): boolean {
  if (!hmacHeader) return false;

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const body = await request.text();
  const hmac = request.headers.get('x-linkedstore-hmac-sha256');

  // Verify webhook signature against the raw body
  if (!verifyNuvemshopWebhook(body, hmac, process.env.NUVEMSHOP_CLIENT_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification. Payloads are thin:
  // { store_id, event, id } — fetch the full resource via the REST API.
  const payload = JSON.parse(body);
  const { store_id: storeId, event, id } = payload;

  console.log(`Received ${event} for store ${storeId} (resource ${id})`);

  // Handle the event based on the resource/action event name
  switch (event) {
    case 'order/created':
      console.log('New order:', id);
      // Your code: GET /v1/{storeId}/orders/{id}, start fulfillment, etc.
      break;

    case 'order/paid':
      console.log('Order paid:', id);
      // Your code: Trigger shipping, record revenue, etc.
      break;

    case 'order/cancelled':
      console.log('Order cancelled:', id);
      // Your code: Restock, refund workflows, etc.
      break;

    case 'order/updated':
      console.log('Order updated:', id);
      // Your code: Re-sync order state, etc.
      break;

    case 'order/fulfilled':
      console.log('Order fulfilled:', id);
      // Your code: Send tracking to customer, etc.
      break;

    case 'product/created':
      console.log('New product:', id);
      // Your code: Sync to external catalog, etc.
      break;

    case 'product/updated':
      console.log('Product updated:', id);
      // Your code: Update external listings, pricing, etc.
      break;

    case 'product/deleted':
      console.log('Product deleted:', id);
      // Your code: Remove from external catalog, etc.
      break;

    case 'customer/created':
      console.log('New customer:', id);
      // Your code: CRM sync, welcome email, etc.
      break;

    case 'app/uninstalled':
      console.log('App uninstalled from store:', storeId);
      // Your code: Clean up store data, revoke tokens, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 2XX within 3 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}
