// Generated with: commercelayer-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Commerce Layer webhook signature.
 *
 * Commerce Layer signs the RAW request body with HMAC-SHA256 keyed on the
 * webhook's shared_secret and sends the digest as base64 in the
 * X-CommerceLayer-Signature header.
 */
export function verifyCommerceLayerSignature(
  rawBody: string,
  signature: string | null,
  sharedSecret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', sharedSecret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffers of different length throw — treat as invalid.
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing so the signature matches byte-for-byte.
  const rawBody = await request.text();
  const signature = request.headers.get('x-commercelayer-signature');
  const topic = request.headers.get('x-commercelayer-topic');

  // Verify first — reject anything that isn't authentic.
  if (!verifyCommerceLayerSignature(rawBody, signature, process.env.COMMERCELAYER_SHARED_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Safe to parse only after verification. Payload is JSON:API.
  const payload = JSON.parse(rawBody);
  const resource = payload.data;

  console.log(`Received ${topic} webhook for ${resource?.type} ${resource?.id}`);

  // Dispatch on the topic ({resource}.{trigger}).
  switch (topic) {
    case 'orders.place':
      console.log('Order placed:', resource?.id);
      // Your code: Start fulfillment, notify ops, etc.
      break;

    case 'orders.approve':
      console.log('Order approved:', resource?.id);
      // Your code: Trigger downstream processing.
      break;

    case 'orders.cancel':
      console.log('Order cancelled:', resource?.id);
      // Your code: Release stock, reverse workflows.
      break;

    case 'orders.pay':
      console.log('Order paid:', resource?.id);
      // Your code: Record revenue, kick off fulfillment.
      break;

    case 'orders.refund':
      console.log('Order refunded:', resource?.id);
      // Your code: Update accounting, notify customer.
      break;

    case 'customers.create':
      console.log('Customer created:', resource?.id);
      // Your code: CRM sync, welcome email.
      break;

    case 'shipments.ship':
      console.log('Shipment shipped:', resource?.id);
      // Your code: Send tracking, update order status.
      break;

    case 'shipments.deliver':
      console.log('Shipment delivered:', resource?.id);
      // Your code: Close order, request a review.
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }

  // Acknowledge quickly (Commerce Layer requires a 2xx within 5 seconds).
  return NextResponse.json({ received: true });
}
