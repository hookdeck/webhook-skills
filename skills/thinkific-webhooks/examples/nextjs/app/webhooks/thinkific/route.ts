// Generated with: thinkific-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyThinkificSignature } from '../../../lib/verify-thinkific';

interface ThinkificEvent {
  id?: string;
  resource?: string;
  action?: string;
  name?: string; // cart.abandoned uses a different envelope: name + data
  payload?: { id?: number | string; [key: string]: unknown };
  data?: { id?: number | string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(event: ThinkificEvent): void {
  const topic = event.resource ? `${event.resource}.${event.action}` : event.name;
  const payload = event.payload ?? event.data ?? {};

  switch (event.resource) {
    case 'order':
      console.log(`Order ${payload.id} (${topic}): ${payload.product_name} for ${payload.amount_cents} cents`);
      // TODO: fulfil the order or record the sale
      break;

    case 'order_transaction':
      console.log(`Transaction ${payload.id} ${event.action}`); // succeeded, failed, refunded
      // TODO: update payment state
      break;

    case 'enrollment':
      console.log(`Enrollment ${payload.id} ${event.action}`);
      // TODO: grant access, send a certificate on "completed"
      break;

    case 'user':
      console.log(`User ${payload.id} ${event.action}`); // signup, signin, updated, deleted
      // TODO: sync the user record
      break;

    case 'course':
      console.log(`Course ${payload.id} ${event.action}`); // created, updated, deleted
      break;

    default:
      console.log(`Unhandled Thinkific event: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes (any content type) and verify before parsing anything.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-thinkific-hmac-sha256');

  if (!verifyThinkificSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid or missing X-Thinkific-Hmac-Sha256 signature' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(event as ThinkificEvent);
  } catch (err) {
    console.error('Error handling Thinkific event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
