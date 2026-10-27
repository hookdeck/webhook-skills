// Generated with: spree-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Spree delivery: X-Spree-Webhook-Signature is the bare hex
 * HMAC-SHA256 of the bytes "<X-Spree-Webhook-Timestamp>." + raw body, keyed with
 * the endpoint's secret_key (UTF-8, used as-is, not hex-decoded).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 */
function verifySpreeSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  if (!signature || !timestamp || !secret) return false;

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters)
  if (!HEX_64.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Build the signed message as bytes: "<timestamp>." + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Hex is case-insensitive: decode to bytes, then compare equal-length buffers in constant time
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export async function POST(request: NextRequest) {
  // Get the raw bytes for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifySpreeSignature(
    rawBody,
    request.headers.get('x-spree-webhook-signature'),
    request.headers.get('x-spree-webhook-timestamp'),
    process.env.SPREE_WEBHOOK_SECRET,
    tolerance
  )) {
    console.error('Spree webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let event: { id?: string; name?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Deduplicate on event.id: a re-sent delivery carries the same id
  const data = event.data ?? {};

  // Dispatch on the body's name (also sent as X-Spree-Webhook-Event)
  switch (event.name) {
    case 'order.placed':
      console.log('Order placed:', { eventId: event.id, order: data.id });
      // TODO: Send the order to your fulfilment or CRM system
      break;

    case 'order.paid':
      console.log('Order paid:', { eventId: event.id, order: data.id });
      // TODO: Release the order for fulfilment
      break;

    case 'order.canceled':
      console.log('Order canceled:', { eventId: event.id, order: data.id });
      // TODO: Cancel downstream work
      break;

    case 'payment.completed':
      console.log('Payment completed:', { eventId: event.id, payment: data.id });
      // TODO: Record the payment
      break;

    case 'fulfillment.fulfilled':
      console.log('Parcel shipped:', { eventId: event.id, fulfillment: data.id });
      // TODO: Notify the customer with tracking details
      break;

    case 'user.created':
      console.log('Customer registered:', { eventId: event.id, user: data.id });
      // TODO: Sync the customer to your CRM
      break;

    case 'product.updated':
      console.log('Product updated:', { eventId: event.id, product: data.id });
      // TODO: Refresh your search index or cache
      break;

    case 'webhook.test':
      console.log('Test delivery received:', { eventId: event.id });
      break;

    default:
      console.log(`Unhandled event: ${event.name}`);
  }

  // Any 2xx acknowledges the delivery
  return NextResponse.json({ received: true });
}
