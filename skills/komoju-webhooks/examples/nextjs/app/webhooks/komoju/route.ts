// Generated with: komoju-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKomojuSignature } from '../../../lib/komoju';

// Demo only: use a durable store (database, Redis) in production
const seenEventIds = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.KOMOJU_WEBHOOK_SECRET;
  if (!secret) {
    console.error('KOMOJU_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-komoju-signature');

  if (!verifyKomojuSignature(rawBody, signature, secret)) {
    console.error('KOMOJU webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // KOMOJU retries non-2xx responses: dedupe on the event id
  if (event.id && seenEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (event.id) seenEventIds.add(event.id);

  // The body's `type` is also sent in the X-Komoju-Event header; `data` is the resource
  const data = event.data ?? {};
  switch (event.type) {
    case 'ping':
      console.log(`Ping from webhook ${data.id}`);
      break;
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.refunded':
    case 'payment.failed':
      console.log(`${event.type}: payment ${data.id} (${data.status}) ${data.total} ${data.currency}`);
      break;
    case 'customer.created':
      console.log(`Customer created: ${data.id}`);
      break;
    case 'subscription.created':
    case 'subscription.captured':
      console.log(`${event.type}: subscription ${data.id}`);
      break;
    default:
      console.log(`Unhandled KOMOJU event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
