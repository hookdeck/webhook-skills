// Generated with: purchasely-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPurchaselyRequest } from '../../../lib/verify-purchasely';

interface PurchaselyEvent {
  event_id?: string;
  event_name?: string;
  user_id?: string;
  plan?: string;
  store?: string;
  amount_in_eur?: number;
  next_renewal_at?: string;
  purchasely_subscription_id?: string;
}

// Purchasely retries until it gets HTTP 200, so the same event can arrive more than once.
// event_id is stable across retries. Use a shared store (Redis, DB) in production.
const processed = new Set<string>();

function handleEvent(event: PurchaselyEvent): void {
  switch (event.event_name) {
    case 'SUBSCRIPTION_STARTED':
      console.log(`Subscription started: ${event.purchasely_subscription_id} (${event.plan}, user ${event.user_id})`);
      // TODO: grant access, start onboarding
      break;

    case 'SUBSCRIPTION_RENEWED':
      console.log(`Subscription renewed: ${event.purchasely_subscription_id}`);
      // TODO: extend access to event.next_renewal_at
      break;

    case 'RENEWAL_DISABLED':
      console.log(`Auto-renew turned off: ${event.purchasely_subscription_id}`);
      // TODO: start a win-back flow
      break;

    case 'GRACE_PERIOD_STARTED':
    case 'ENTERED_BILLING_RETRY':
      console.log(`Billing issue (${event.event_name}): ${event.purchasely_subscription_id}`);
      // TODO: nudge the user to fix their payment method
      break;

    case 'SUBSCRIPTION_TERMINATED':
      console.log(`Subscription terminated: ${event.purchasely_subscription_id}`);
      // TODO: revoke access
      break;

    case 'TRANSACTION_PROCESSED':
      console.log(`Transaction processed: ${event.amount_in_eur} EUR (${event.store})`);
      // TODO: record revenue
      break;

    case 'ACTIVATE':
      console.log(`Entitlement activated for user ${event.user_id}`);
      // TODO: unlock the entitlement
      break;

    default:
      console.log(`Unhandled event: ${event.event_name}`);
  }
}

export async function POST(request: NextRequest) {
  // Verify the exact bytes received, whatever the content type.
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (!verifyPurchaselyRequest(request.headers, rawBody)) {
    return NextResponse.json({ error: 'Invalid or missing Purchasely signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const event = payload as PurchaselyEvent;
  if (event.event_id && processed.has(event.event_id)) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Purchasely event:', err);
    // Any non-200 is retried, and later events for this user wait until it succeeds.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.event_id) processed.add(event.event_id);
  // Purchasely acknowledges only an exact HTTP 200 (other 2xx codes are retried).
  return NextResponse.json({ received: true }, { status: 200 });
}
