// Generated with: charitystack-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { toleranceFromEnv, verifyCharityStackSignature } from '../../../lib/charitystack-signature';

function handleEvent(event: { type?: unknown }, deliveryId: string | null) {
  switch (event.type) {
    case 'donation.created':
      console.log(`New donation received (delivery ${deliveryId})`);
      break;
    case 'donation.updated':
      console.log(`Donation status changed (delivery ${deliveryId})`);
      break;
    case 'subscription.created':
      console.log(`Recurring subscription started (delivery ${deliveryId})`);
      break;
    case 'subscription.updated':
      // Also fires alongside subscription.payment_method_updated.
      console.log(`Subscription modified (delivery ${deliveryId})`);
      break;
    case 'subscription.cancelled':
      console.log(`Subscription cancelled (delivery ${deliveryId})`);
      break;
    case 'subscription.payment_method_updated':
      console.log(`Subscription payment method updated (delivery ${deliveryId})`);
      break;
    case 'contact.created':
    case 'contact.updated':
      console.log(`${String(event.type)} (delivery ${deliveryId})`);
      break;
    default:
      // form.created, form.updated and any future types: log and acknowledge.
      console.log(`Unhandled CharityStack event type: ${String(event.type)}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CHARITYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHARITYSTACK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as signed. Parse only after verification.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const verification = verifyCharityStackSignature(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!verification.valid) {
    console.error('CharityStack webhook verification failed:', verification.error);
    return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // In production: persist the event, return 2xx, then process asynchronously.
  handleEvent(event, request.headers.get('x-webhook-id'));

  return NextResponse.json({ received: true });
}
