// Generated with: rewardful-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRewardfulSignature, seenEvents } from '../../../lib/verify-rewardful';

interface RewardfulPayload {
  object?: Record<string, unknown>;
  event?: { id?: string; type?: string; created_at?: string; api_version?: string };
  request?: { id?: string };
}

function handleEvent(payload: RewardfulPayload): void {
  const type = payload.event?.type;
  const object = payload.object ?? {};

  switch (type) {
    case 'affiliate.created':
      console.log(`Affiliate created: ${object.email} (${object.id})`);
      // TODO: create a CRM contact
      break;

    case 'affiliate.confirmed':
      console.log(`Affiliate confirmed: ${object.email} (${object.id})`);
      // TODO: send onboarding
      break;

    case 'referral.lead':
      console.log(`Referral became a lead: ${object.id}`);
      // TODO: track the funnel
      break;

    case 'referral.converted':
      console.log(`Referral converted: ${object.id}`);
      // TODO: attribute revenue to the affiliate
      break;

    case 'sale.created':
      console.log(`Sale created: ${object.id}`);
      // TODO: record the sale
      break;

    case 'sale.refunded':
      console.log(`Sale refunded: ${object.id}`);
      // TODO: reverse attribution
      break;

    case 'commission.created':
      console.log(`Commission created: ${object.id}`);
      // TODO: record the liability
      break;

    case 'commission.paid':
      console.log(`Commission paid: ${object.id}`);
      // TODO: notify the affiliate
      break;

    case 'payout.due':
      console.log(`Payout due: ${object.id}`);
      // TODO: queue finance work
      break;

    case 'payout.paid':
      console.log(`Payout paid: ${object.id}`);
      // TODO: mark as settled
      break;

    case 'payout.failed':
      console.log(`Payout failed: ${object.id}`);
      // TODO: alert finance
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, any content type: the exact body is what Rewardful signed.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-rewardful-signature');

  if (!verifyRewardfulSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // Retries redeliver the same event; acknowledge repeats without reprocessing.
  const event = payload as RewardfulPayload;
  const eventId = event.event?.id;
  if (eventId && seenEvents.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Rewardful event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (eventId) seenEvents.add(eventId);
  return NextResponse.json({ received: true });
}
