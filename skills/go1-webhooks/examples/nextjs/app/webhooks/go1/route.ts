// Generated with: go1-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyGo1Webhook } from '../../../lib/go1';

interface Go1Event {
  id: string;
  event_type: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  // request.text() works for any content type.
  const rawBody = await request.text();
  const header = request.headers.get('go1-signature');
  const secret = process.env.GO1_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing Go1-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('GO1_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyGo1Webhook(rawBody, header, secret)) {
    console.error('Go1 webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification.
  let event: Go1Event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.event_type) {
    case 'enrollment.create':
      console.log(`Enrollment created: ${event.id}`);
      break;
    case 'enrollment.update':
      console.log(`Enrollment updated: ${event.id}`);
      break;
    case 'enrollment.delete':
      console.log(`Enrollment deleted: ${event.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }
  // TODO: persist / forward. Make handling idempotent (e.g. key on event_type + id).

  return NextResponse.json({ received: true });
}
