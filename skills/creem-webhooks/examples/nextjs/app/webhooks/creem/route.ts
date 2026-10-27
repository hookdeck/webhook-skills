// Generated with: creem-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCreemSignature } from '../../../lib/verify-creem';

interface CreemWebhook {
  id?: string;
  eventType?: string;
  object?: Record<string, any>;
  [key: string]: unknown;
}

function handleEvent(body: CreemWebhook): void {
  const { eventType } = body;
  const resource = body.object ?? {};

  switch (eventType) {
    case 'checkout.completed':
      console.log('Checkout completed', resource.id, resource.order?.id);
      // TODO: fulfil the order; resource.metadata / resource.request_id carry your own reference
      break;

    case 'subscription.paid':
      console.log('Subscription paid', resource.id);
      // TODO: grant or extend access (Creem recommends this event over subscription.active)
      break;

    case 'subscription.active':
    case 'subscription.trialing':
    case 'subscription.update':
    case 'subscription.paused':
      console.log(`Subscription state change (${eventType})`, resource.id, resource.status);
      // TODO: sync the subscription record
      break;

    case 'subscription.scheduled_cancel':
      console.log('Subscription scheduled to cancel', resource.id, resource.current_period_end_date);
      // TODO: notify the customer or offer a retention incentive
      break;

    case 'subscription.past_due':
    case 'subscription.unpaid':
      console.log(`Subscription payment problem (${eventType})`, resource.id);
      // TODO: prompt for a payment-method update; suspend access per your policy
      break;

    case 'subscription.canceled':
    case 'subscription.expired':
      console.log(`Subscription ended (${eventType})`, resource.id);
      // TODO: revoke access
      break;

    case 'refund.created':
      console.log('Refund created', resource.id, resource.refund_amount, resource.refund_currency);
      break;

    case 'dispute.created':
      console.log('Dispute created', resource.id, resource.amount, resource.currency);
      // TODO: alert your team
      break;

    case 'credits.granted':
    case 'credits.consumed':
    case 'credits.auto_recharged':
    case 'customer_credits.exhausted':
      console.log(`Customer credits event (${eventType})`, resource.customer_id, resource.bucket_name);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes received (any content type); the signature covers them.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyCreemSignature(rawBody, request.headers.get('creem-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(body as CreemWebhook);
  } catch (err) {
    console.error('Error handling Creem event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
