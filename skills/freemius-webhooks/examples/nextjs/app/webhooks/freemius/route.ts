// Generated with: freemius-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify a Freemius webhook signature.
 *
 * Freemius sends `x-signature: <hex>`: the bare hex HMAC-SHA256 of the raw request
 * body, keyed with the product's secret key (UTF-8 bytes, used as-is). No prefix,
 * no timestamp.
 */
function verifyFreemiusSignature(rawBody: Buffer, signature: string | null, secret: string): boolean {
  // Check the shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Handle a verified event. The delivered payload has the same schema as Freemius's
 * API event resource, with the event name in the top-level `type`.
 */
function handleEvent(event: Record<string, unknown> & { type: string }) {
  // Only touch nested fields after checking their type: the body is untrusted input
  const id = typeof event.id === 'string' || typeof event.id === 'number' ? event.id : '(no id)';
  const objects = isObject(event.objects) ? Object.keys(event.objects) : [];

  switch (event.type) {
    case 'license.activated':
    case 'license.created':
      console.log(`License event ${event.type} (${id}); objects: ${objects.join(', ') || 'none'}`);
      // TODO: Provision or unlock the product for this license
      break;
    case 'license.cancelled':
      console.log(`License cancelled (${id})`);
      // TODO: Revoke access
      break;
    case 'subscription.created':
    case 'subscription.cancelled':
      console.log(`Subscription event ${event.type} (${id})`);
      // TODO: Sync subscription state
      break;
    case 'payment.created':
    case 'payment.refund':
      console.log(`Payment event ${event.type} (${id})`);
      // TODO: Record the payment or refund
      break;
    case 'user.created':
      console.log(`New user (${id})`);
      // TODO: Create the customer record
      break;
    default:
      // Freemius lists ~150 event types and may add more at any time: log and acknowledge
      console.log(`Unhandled Freemius event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.FREEMIUS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FREEMIUS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the raw bytes - verification must run on exactly what Freemius sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyFreemiusSignature(rawBody, request.headers.get('x-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event) || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  try {
    handleEvent(event as Record<string, unknown> & { type: string });
  } catch (err) {
    console.error('Error handling Freemius webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
