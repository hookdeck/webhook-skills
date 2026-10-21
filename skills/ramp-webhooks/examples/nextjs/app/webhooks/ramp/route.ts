import { NextRequest, NextResponse } from 'next/server';
import { verifyRampSignature } from '../../../lib/verify-ramp';

// Ramp payloads carry IDs only; fetch the resource from the Ramp API for details
type RampEvent = {
  id?: string;
  type?: string;
  created_at?: string;
  business_id?: string;
  object?: { id?: string; [key: string]: unknown };
  challenge?: string; // webhooks.verification only
};

function handleRampEvent(event: RampEvent) {
  switch (event.type) {
    case 'webhooks.verification':
      // Sent once when the subscription is created. Returning 2xx is step one;
      // you must also POST the challenge to /developer/v1/webhooks/{id}/verify.
      console.log(`Verification challenge received: ${event.challenge}`);
      break;

    case 'transactions.authorized':
      console.log(`Transaction authorized: ${event.object?.id}`);
      // TODO: Record the pending card authorization
      break;

    case 'transactions.cleared':
      console.log(`Transaction cleared: ${event.object?.id}`);
      // TODO: Fetch the transaction; entity_amount.value is negative for refunds
      break;

    case 'transactions.declined':
      console.log(`Transaction declined: ${event.object?.id}`);
      // TODO: Alert the cardholder or finance team
      break;

    case 'reimbursements.ready_for_review':
      console.log(`Reimbursement ready for review: ${event.object?.id}`);
      // TODO: Route to an approver
      break;

    case 'bills.created':
      console.log(`Bill created: ${event.object?.id}`);
      // TODO: Sync the bill to your accounting system
      break;

    case 'bills.approved':
      console.log(`Bill approved: ${event.object?.id}`);
      // TODO: Schedule payment
      break;

    case 'bills.paid':
      console.log(`Bill paid: ${event.object?.id}`);
      // TODO: Mark the bill as paid
      break;

    case 'tests.test_event':
      console.log('Received Ramp test event');
      break;

    default:
      console.log(`Unhandled Ramp event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RAMP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RAMP_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-ramp-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Ramp-Signature header' }, { status: 400 });
  }

  // Use the raw body text for verification (not request.json())
  const rawBody = await request.text();
  if (!verifyRampSignature(rawBody, signature, secret)) {
    console.error('Ramp webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: RampEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Business events repeat the same event.id on every retry (also sent as
  // X-Ramp-Webhook-ID); use it to de-duplicate.
  handleRampEvent(event);

  return NextResponse.json({ received: true });
}
