// Generated with: memberful-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMemberfulSignature } from '../../../lib/verify-memberful';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
// Parsed fields are untrusted: only use values of the expected type.
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const idOf = (v: unknown): string | number | undefined =>
  isObject(v) && (typeof v.id === 'string' || typeof v.id === 'number') ? v.id : undefined;

// Memberful's event reference lists these names but never shows where the name travels.
// ASSUMPTION: a top-level `event` field. Confirm against a real delivery (Settings > Webhooks > test).
function handleEvent(payload: JsonObject): void {
  const eventType = str(payload.event);

  switch (eventType) {
    case 'member_signup':
      console.log(`Member signed up: ${idOf(payload.member)}`);
      // TODO: create the member in your app
      break;

    case 'member_updated':
    case 'member.deleted':
    case 'tax_id.updated':
    case 'custom_fields.updated':
      console.log(`${eventType}: member ${idOf(payload.member)}`);
      // TODO: sync or remove the member's profile
      break;

    case 'subscription.created':
    case 'subscription.renewed':
    case 'subscription.activated':
    case 'subscription.reactivated':
      console.log(`${eventType}: subscription ${idOf(payload.subscription)}`);
      // TODO: grant or extend the member's access
      break;

    case 'subscription.updated':
      // `changed` maps field -> [old, new]; a plan_id entry means a plan change.
      console.log(`subscription.updated: subscription ${idOf(payload.subscription)}`);
      // TODO: re-fetch the subscription from the API (delivery order is not guaranteed)
      break;

    case 'subscription.deactivated':
    case 'subscription.deleted':
      console.log(`${eventType}: subscription ${idOf(payload.subscription)}`);
      // TODO: remove the member's access
      break;

    case 'order.purchased':
    case 'order.refunded':
    case 'order.suspended':
    case 'order.completed':
      console.log(`${eventType}: order ${idOf(payload.order)}`);
      // TODO: record the order or refund
      break;

    case 'subscription_plan.created':
    case 'subscription_plan.updated':
    case 'subscription_plan.deleted':
    case 'download.created':
    case 'download.updated':
    case 'download.deleted':
      console.log(`${eventType} received`);
      // TODO: sync prices (subscription_plan.*) or downloads
      break;

    default:
      console.log(`Unhandled event: ${eventType} (keys: ${Object.keys(payload).join(', ')})`);
  }
}

// Memberful sends POST only; Next.js answers 405 for the methods not exported here.
export async function POST(request: NextRequest) {
  // Raw bytes, never decoded and re-encoded.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyMemberfulSignature(rawBody, request.headers.get('x-memberful-webhook-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing X-Memberful-Webhook-Signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Memberful webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
