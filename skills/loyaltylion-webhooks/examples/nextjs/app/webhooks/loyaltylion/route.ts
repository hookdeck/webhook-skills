// Generated with: loyaltylion-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  getCustomer,
  getData,
  getTopic,
  verifyLoyaltyLionSignature,
  type LoyaltyLionBody,
} from '../../../lib/verify-loyaltylion';

function handleEvent(topic: string | undefined, body: LoyaltyLionBody): void {
  const data = getData(body);
  const customer = getCustomer(data);

  switch (topic) {
    case 'customers/update':
      console.log(`Customer ${customer.id} updated (${customer.points_approved} points approved)`);
      // TODO: sync the customer's points balance and tier to your system
      break;

    case 'program_events/customer.enrolled':
      console.log(`Customer ${customer.id} enrolled in the loyalty program`);
      // TODO: send a welcome message or tag the customer
      break;

    case 'program_events/customer.points_earned':
      console.log(`Customer ${customer.id} earned points`);
      // TODO: record the transaction (data.properties.transaction)
      break;

    case 'program_events/customer.tier_upgraded':
    case 'program_events/customer.tier_downgraded':
      console.log(`Customer ${customer.id} tier changed (${topic.split('.').pop()})`);
      // TODO: update tier-based perks
      break;

    case 'program_events/customer.claimed_reward':
      console.log(`Customer ${customer.id} claimed a reward`);
      // TODO: fulfil or record the reward (voucher_code, discount_amount, ...)
      break;

    case 'program_events/customer.referral_complete':
      console.log(`Referral completed for customer ${customer.id}`);
      break;

    case 'loyalty_emails/unsubscribe':
      console.log(`Customer ${data.unsubscribe?.customer?.id} unsubscribed from loyalty emails`);
      // TODO: suppress loyalty emails for this customer
      break;

    case 'receipts/manual_approval_required':
      console.log(`Receipt ${data.receipt?.id} needs manual review`);
      break;

    case 'rewards/store_fulfilment':
      // A 2xx response marks this redemption as successfully fulfilled. `test: true` is sent
      // when you create or update the custom reward, to confirm the URL works.
      console.log(`Fulfilment ${body.reward_fulfilment_id} for reward ${body.reward_identifier}${body.test ? ' (test)' : ''}`);
      // TODO: grant the custom reward to body.customer_id
      break;

    default:
      console.log(`Unhandled LoyaltyLion topic: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.LOYALTYLION_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOYALTYLION_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes; parse only after the signature check.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyLoyaltyLionSignature(rawBody, request.headers.get('x-loyaltylion-hmac-sha256'), secret)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let body: LoyaltyLionBody;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // At-least-once delivery: dedupe on body.id (envelope webhooks) before doing real work.
  try {
    handleEvent(getTopic(body), body);
  } catch (err) {
    console.error('Error handling LoyaltyLion webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // LoyaltyLion needs a 200 within 5 seconds, otherwise the delivery counts as failed
  return NextResponse.json({ received: true });
}
