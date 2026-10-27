// Generated with: paypercut-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_METHODS, handleEvent, verifyPaypercutSignature } from '../../../lib/verify-paypercut';
import type { PaypercutEvent } from '../../../lib/verify-paypercut';

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedDeliveryIds = new Set<string>();

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.PAYPERCUT_WEBHOOK_SECRET) {
    console.error('Set PAYPERCUT_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received (empty for a GET). Never verify a parsed body.
  const rawBody = new Uint8Array(await request.arrayBuffer());

  // Signature first, for every method.
  if (!verifyPaypercutSignature(rawBody, request.headers.get('paypercut-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing Paypercut-Signature' }, { status: 401 });
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } }
    );
  }

  // A verified request with no body (for example GET) is acknowledged.
  if (rawBody.length === 0) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let event: PaypercutEvent;
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Invalid event type format' }, { status: 400 });
  }

  // Dedupe on Paypercut-Delivery-Id, recorded only after the event is handled.
  const deliveryId = request.headers.get('paypercut-delivery-id');
  if (deliveryId && processedDeliveryIds.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Paypercut event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 }); // Paypercut retries on 500
  }

  if (deliveryId) processedDeliveryIds.add(deliveryId);
  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
