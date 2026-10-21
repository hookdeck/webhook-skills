// Generated with: lemon-squeezy-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret.
function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8'
  );
  const received = Buffer.from(signatureHeader, 'utf8');
  // timingSafeEqual throws on length mismatch, so check first
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEMON_SQUEEZY_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Signing secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 400 });
  }

  // Use the raw text body - parsing JSON first would change the bytes that were signed
  const rawBody = await request.text();

  if (!verifySignature(rawBody, signature, secret)) {
    console.error('Lemon Squeezy signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // X-Event-Name carries the event; meta.event_name has the same value
  const eventName = request.headers.get('x-event-name') ?? payload.meta?.event_name;
  const resource = payload.data;
  // custom_data is whatever you passed to checkout (e.g. your user id)
  const customData = payload.meta?.custom_data;

  switch (eventName) {
    case 'order_created':
      console.log(`Order created: ${resource.id} (${resource.attributes.total_formatted})`, customData);
      break;
    case 'order_refunded':
      console.log(`Order refunded: ${resource.id}`);
      break;
    case 'subscription_created':
      console.log(`Subscription created: ${resource.id} (${resource.attributes.status})`, customData);
      break;
    case 'subscription_updated':
      console.log(`Subscription updated: ${resource.id} (${resource.attributes.status})`);
      break;
    case 'subscription_cancelled':
      console.log(`Subscription cancelled: ${resource.id}, ends at ${resource.attributes.ends_at}`);
      break;
    case 'subscription_payment_success':
      console.log(`Subscription payment succeeded: invoice ${resource.id}`);
      break;
    case 'license_key_created':
      console.log(`License key created: ${resource.id}`);
      break;
    default:
      console.log(`Unhandled event: ${eventName}`);
  }

  // Lemon Squeezy retries up to 3 more times on any non-200 response
  return NextResponse.json({ received: true });
}
