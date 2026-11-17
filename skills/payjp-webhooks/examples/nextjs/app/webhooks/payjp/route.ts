// Generated with: payjp-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPayjpRequest, seenEvents } from '../../../lib/verify-payjp';

interface PayjpEvent {
  id?: string;
  object?: string;
  livemode?: boolean;
  type: string;
  created?: number;
  pending_webhooks?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

function handleEvent(event: PayjpEvent): void {
  const { type, data } = event;

  switch (type) {
    case 'charge.succeeded':
      console.log(`Charge succeeded: ${data.id} (${data.amount} ${data.currency})`);
      // Fulfil the order
      break;

    case 'charge.failed':
      console.log(`Charge failed: ${data.id} (${data.failure_code})`);
      // Notify the customer
      break;

    case 'charge.updated':
      console.log(`Charge updated: ${data.id}`);
      // Sync metadata
      break;

    case 'charge.refunded':
      console.log(`Charge refunded: ${data.id} (${data.amount_refunded} refunded)`);
      // Reverse fulfilment
      break;

    case 'charge.captured':
      console.log(`Charge captured: ${data.id}`);
      // Confirm the sale
      break;

    case 'dispute.created':
      console.log(`Dispute created: ${data.id}`);
      // Gather evidence
      break;

    case 'customer.created':
      console.log(`Customer created: ${data.id}`);
      // Sync the customer record
      break;

    case 'customer.updated':
      console.log(`Customer updated: ${data.id}`);
      // Sync the customer record
      break;

    case 'customer.deleted':
      console.log(`Customer deleted: ${data.id}`);
      // Remove the customer record
      break;

    case 'subscription.created':
      console.log(`Subscription created: ${data.id}`);
      // Activate access
      break;

    case 'subscription.renewed':
      console.log(`Subscription renewed: ${data.id}`);
      // Extend access
      break;

    case 'subscription.canceled':
      console.log(`Subscription canceled: ${data.id}`);
      // Schedule revocation
      break;

    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${data.id}`);
      // Reconcile the payout
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPayjpRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-Payjp-Webhook-Token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = payload as PayjpEvent;
  if (!event || typeof event !== 'object' || Array.isArray(event)
      || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') {
    return NextResponse.json({ error: 'Expected a PAY.JP event object' }, { status: 400 });
  }

  // PAY.JP can deliver the same event more than once: dedupe on the event id.
  if (event.id && seenEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling PAY.JP event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.id) seenEvents.add(event.id);
  return NextResponse.json({ received: true });
}
