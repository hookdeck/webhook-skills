// Generated with: checkout-page-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCheckoutPageWebhook } from '../../../lib/verify';

// In-memory dedupe for the example; use a shared store (Redis, DB) in production
const seenEventIds = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.CHECKOUT_PAGE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHECKOUT_PAGE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing — the signature is over the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }
  if (!verifyCheckoutPageWebhook(rawBody, signature, secret)) {
    console.error('Checkout Page webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: string; eventId?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Retries re-send the same eventId
  const eventId = payload.eventId;
  if (eventId && seenEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (eventId) seenEventIds.add(eventId);

  const attempt = request.headers.get('x-webhook-delivery-attempt');
  console.log(`Received ${payload.event} (eventId ${eventId}, attempt ${attempt})`);
  const data = payload.data || {};

  switch (payload.event) {
    case 'payment.paid':
      console.log('Payment paid:', JSON.stringify(data.payment ?? data));
      // TODO: Fulfil the order, grant access
      break;

    case 'payment.created':
      console.log('Payment created');
      break;

    case 'payment.abandoned':
      console.log('Payment abandoned');
      break;

    case 'booking.created':
      console.log('Booking created:', JSON.stringify(data.booking ?? data));
      // TODO: Sync to calendar / CRM
      break;

    case 'booking.paid':
      console.log('Booking paid');
      break;

    case 'subscription.created':
    case 'subscription.active':
      console.log(`Subscription started (${payload.event})`);
      // TODO: Provision features
      break;

    case 'subscription.canceled':
    case 'subscription.expired':
      console.log(`Subscription ended (${payload.event})`);
      // TODO: Revoke access
      break;

    case 'customer.created':
    case 'customer.updated':
      console.log(`Customer event: ${payload.event}`);
      break;

    case 'submission.created':
      console.log('Form submission created');
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  // Acknowledge quickly; do slow work asynchronously
  return NextResponse.json({ received: true });
}
