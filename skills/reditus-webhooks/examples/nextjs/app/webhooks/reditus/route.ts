// Generated with: reditus-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyReditusSignature } from '../../../lib/verify-reditus';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
// Parsed fields are untrusted: only log values of the expected type.
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function handleEvent(payload: JsonObject): void {
  const eventType = str(payload.event_type);
  const data: JsonObject = isObject(payload.data) ? payload.data : {};

  switch (eventType) {
    case 'partnership.accepted':
      console.log(`Partnership accepted: ${str(data.affiliate_email)}`);
      // TODO: activate the affiliate in your system
      break;

    case 'referral.created':
      console.log(`Referral created: ${str(data.referral_id)} (affiliate ${str(data.affiliate_email)})`);
      // TODO: record the referral
      break;

    case 'advocate.created':
      console.log(`Advocate created: ${str(data.advocate_id)} (${str(data.advocate_email)})`);
      // TODO: send the advocate their referral link
      break;

    case 'lead.created':
      console.log(`Lead created: ${str(data.lead_id)} for advocate ${str(data.advocate_uid)}`);
      // TODO: attribute the lead to the advocate
      break;

    case 'reward.created': {
      // The docs' sample shows amount 5521 as $55.21, i.e. minor units.
      const amount = typeof data.amount === 'number' ? data.amount : undefined;
      console.log(`Reward created: ${str(data.reward_id)} amount=${amount} ${str(data.currency)}`);
      // TODO: grant the reward
      break;
    }

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Reditus's docs don't name the HTTP method, so the same handler serves all five.
async function handle(request: NextRequest) {
  // Raw bytes, never decoded and re-encoded; a request with no body is zero bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyReditusSignature(rawBody, request.headers.get('x-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing X-Signature' }, { status: 401 });
  }

  if (rawBody.length === 0) {
    console.log(`${request.method} webhook with empty body`);
    return NextResponse.json({ received: true });
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
    console.error('Error handling Reditus webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
