// Generated with: belco-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBelcoSignature } from '../../../lib/belco';

// Demo only: use a durable store (database, Redis) in production
const seenRequestIds = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.BELCO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BELCO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-hook-signature');

  if (!verifyBelcoSignature(rawBody, signature, secret)) {
    console.error('Belco webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Belco retries non-2xx responses: dedupe on requestId
  if (event.requestId && seenRequestIds.has(event.requestId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (event.requestId) seenRequestIds.add(event.requestId);

  const payload = event.payload ?? {};
  switch (event.eventName) {
    case 'conversation.created':
      console.log(`Conversation created: ${payload.conversation?._id} on shop ${payload.shopId}`);
      break;
    case 'conversation.replied':
      console.log(`Conversation replied: ${payload.conversation?._id}`);
      break;
    case 'conversation.assigned':
      console.log(`Conversation assigned: ${payload.conversation?._id} to ${payload.conversation?.assignedTo}`);
      break;
    case 'conversation.closed':
      console.log(`Conversation closed: ${payload.conversation?._id}`);
      break;
    case 'call.created':
    case 'call.queued':
    case 'call.answered':
    case 'call.closed':
      console.log(`${event.eventName}: ${payload.call?.direction} call, status ${payload.call?.status}`);
      break;
    default:
      console.log(`Unhandled Belco event: ${event.eventName}`);
  }

  return NextResponse.json({ received: true });
}
