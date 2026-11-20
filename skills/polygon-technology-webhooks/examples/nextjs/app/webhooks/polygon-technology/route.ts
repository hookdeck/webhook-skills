// Generated with: polygon-technology-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyOmsSignature, processEvent, type OmsEvent } from '../../../lib/polygon-technology';

export async function POST(request: Request) {
  const signingKey = process.env.OMS_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('OMS_WEBHOOK_SIGNING_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook signing key not configured' }, { status: 500 });
  }

  // Read the raw body: the HMAC covers "<t>.<exact bytes>". Never re-serialize parsed JSON.
  const rawBody = await request.text();
  if (!verifyOmsSignature(rawBody, request.headers.get('webhook-signature'), signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: OmsEvent;
  try {
    event = JSON.parse(rawBody) as OmsEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Respond fast (timeoutMs defaults to 5000, max 10000). In production,
  // persist the event here, return 2xx, and do slow work asynchronously.
  const result = processEvent(event);
  return NextResponse.json({ received: true, id: event.id, type: event.type, result });
}
