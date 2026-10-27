// Generated with: metronome-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { isDateWithinTolerance, seenEventIds, verifyMetronomeSignature } from '../../../lib/metronome';

export async function POST(request: NextRequest) {
  // Raw bytes: verify these exactly, parse only afterwards
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('metronome-webhook-signature');
  // Use X-Metronome-Date, never Date (intermediaries may rewrite Date)
  const dateHeader = request.headers.get('x-metronome-date');

  if (!verifyMetronomeSignature(rawBody, signature, dateHeader, process.env.METRONOME_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (!isDateWithinTolerance(dateHeader as string)) {
    return NextResponse.json({ error: 'X-Metronome-Date outside tolerance' }, { status: 401 });
  }

  let event: { id?: string; type?: string; properties?: Record<string, unknown>; [key: string]: unknown };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (event.id) {
    if (seenEventIds.has(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    seenEventIds.add(event.id);
  }

  // Threshold, invoice and integration events nest data under `properties`;
  // contract, commit, credit and subscription events are flat.
  const data = (event.properties ?? event) as Record<string, unknown>;

  switch (event.type) {
    case 'alerts.spend_threshold_reached':
      console.log('Spend threshold reached:', data.customer_id, data.current_spend);
      // TODO: Notify the customer or throttle
      break;
    case 'alerts.low_remaining_credit_balance_reached':
      console.log('Low credit balance:', data.customer_id, data.remaining_balance);
      // TODO: Trigger a top-up
      break;
    case 'alerts.low_remaining_commit_balance_reached':
      console.log('Low commit balance:', data.customer_id);
      // TODO: Alert the account owner
      break;
    case 'alerts.usage_threshold_reached':
      console.log('Usage threshold reached:', data.customer_id);
      // TODO: Notify the customer
      break;
    case 'alerts.invoice_total_reached':
      console.log('Invoice total reached:', data.customer_id);
      // TODO: Flag the invoice for review
      break;
    case 'contract.create':
      console.log('Contract created:', data.contract_id);
      // TODO: Provision the customer
      break;
    case 'contract.start':
      console.log('Contract started:', data.contract_id);
      break;
    case 'contract.edit':
      console.log('Contract edited:', data.contract_id);
      break;
    case 'contract.end':
      console.log('Contract ended:', data.contract_id);
      // TODO: Revoke entitlements
      break;
    case 'contract.archive':
      console.log('Contract archived:', data.contract_id);
      break;
    case 'commit.create':
      console.log('Commit created:', data.commit_id);
      break;
    case 'credit.create':
      console.log('Credit created:', data.credit_id);
      break;
    case 'invoice.finalized':
      console.log('Invoice finalized:', data.invoice_id);
      // TODO: Record the receivable
      break;
    case 'invoice.void':
      console.log('Invoice voided:', data.invoice_id);
      break;
    case 'invoice.billing_provider_error':
      console.log('Billing provider error:', data.invoice_id, data.billing_provider_error);
      // TODO: Page whoever owns the billing integration
      break;
    case 'subscription.start':
      console.log('Subscription started:', data.subscription_id);
      break;
    case 'subscription.end':
      console.log('Subscription ended:', data.subscription_id);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
