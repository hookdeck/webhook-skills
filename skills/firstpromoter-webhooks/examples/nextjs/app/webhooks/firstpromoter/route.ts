// Generated with: firstpromoter-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirstPromoterRequest, seenEvents } from '../../../lib/verify-firstpromoter';

interface FirstPromoterPayload {
  event_id?: string;
  event_type?: string;
  action?: string;
  entity_type?: string;
  entity_id?: number;
  changes?: Record<string, unknown>;
  data?: Record<string, unknown>;
  timestamp?: string;
}

function handleEvent(payload: FirstPromoterPayload): void {
  const { event_type: type, entity_id: id, data = {}, changes = {} } = payload;

  switch (type) {
    case 'promoter.created':
      console.log(`Promoter created: ${data.email} (${id})`);
      // TODO: create a CRM contact, send onboarding
      break;

    case 'promoter.updated':
      console.log(`Promoter updated: ${id}`, Object.keys(changes));
      // TODO: sync the profile
      break;

    case 'promoter.deleted':
      console.log(`Promoter deleted: ${id}`);
      // TODO: deprovision
      break;

    case 'promoter.balance.updated':
      console.log(`Promoter balance updated: ${id}`);
      // TODO: update the balance shown in your app
      break;

    case 'referral.created':
      console.log(`Referral created: ${data.email} (${id})`);
      // TODO: attribute the signup
      break;

    case 'referral.updated':
      console.log(`Referral updated: ${id}`, Object.keys(changes));
      // TODO: sync state (changes.state = [old, new])
      break;

    case 'referral.converted':
      console.log(`Referral converted: ${data.email} (${id})`);
      // TODO: credit the promoter, notify
      break;

    case 'referral.cancelled':
      console.log(`Referral cancelled: ${id}`);
      // TODO: reverse benefits
      break;

    case 'referral.deleted':
      console.log(`Referral deleted: ${id}`);
      // TODO: clean up
      break;

    case 'referral.moved':
      console.log(`Referral moved campaign: ${id}`);
      // TODO: re-tier
      break;

    case 'commission.created':
      console.log(`Commission created: ${id} amount=${data.amount} ${data.unit}`);
      // TODO: record the liability
      break;

    case 'commission.updated':
      console.log(`Commission updated: ${id}`, Object.keys(changes));
      // TODO: sync status
      break;

    case 'commission.approved':
      console.log(`Commission approved: ${id}`);
      // TODO: queue for payout
      break;

    case 'commission.pending':
      console.log(`Commission pending: ${id}`);
      // TODO: hold
      break;

    case 'commission.denied':
      console.log(`Commission denied: ${id}`);
      // TODO: notify the promoter
      break;

    case 'commission.deleted':
      console.log(`Commission deleted: ${id}`);
      // TODO: remove the liability
      break;

    case 'payout.created':
      console.log(`Payout created: ${id}`);
      // TODO: open a payout record
      break;

    case 'payout.completed':
      console.log(`Payout completed: ${id}`);
      // TODO: mark as paid
      break;

    case 'payout.failed':
      console.log(`Payout failed: ${id}`);
      // TODO: alert finance
      break;

    case 'contract_document.signed':
      console.log(`Contract signed: ${id} by promoter ${data.promoter_id}`);
      // TODO: unlock the program for the promoter
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFirstPromoterRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // Retries redeliver the same event_id; acknowledge repeats without reprocessing.
  const event = payload as FirstPromoterPayload;
  const eventId = event.event_id || request.headers.get('x-event-id');
  if (eventId && seenEvents.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling FirstPromoter event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (eventId) seenEvents.add(eventId);
  return NextResponse.json({ received: true });
}
