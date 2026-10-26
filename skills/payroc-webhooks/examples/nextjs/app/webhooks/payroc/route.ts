// Generated with: payroc-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPayrocRequest } from '../../../lib/verify-payroc';

interface PayrocEvent {
  specversion?: string;
  type?: string;
  version?: string;
  source?: string;
  id?: string;
  time?: string;
  datacontenttype?: string;
  data?: Record<string, unknown>;
}

// Processed event ids. Use a shared store (Redis, database) in production.
const seenIds = new Set<string>();

function handleEvent(event: PayrocEvent): void {
  switch (event.type) {
    case 'processingAccount.status.changed':
      console.log(`Processing account ${event.data?.processingAccountId} status: ${event.data?.status}`);
      // TODO: update onboarding state
      break;

    case 'processingAccount.riskStatus.changed':
      console.log(`Processing account ${event.data?.processingAccountId} risk status: ${event.data?.riskStatus}`);
      // TODO: alert risk and support teams
      break;

    case 'processingAccount.signature.signed':
      console.log(`Processing account ${event.data?.processingAccountId} signed: ${event.data?.signed}`);
      // TODO: continue onboarding
      break;

    case 'terminalOrder.status.changed':
      console.log(`Terminal order status changed: ${JSON.stringify(event.data)}`);
      // TODO: update fulfilment status
      break;

    default:
      console.log(`Unhandled event: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPayrocRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Payroc-Secret' }, { status: 401 });
  }

  let event: unknown;
  try {
    // Read as text so any content type is accepted.
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const payload = event as PayrocEvent;

  // Retries re-send the same CloudEvent id: acknowledge without reprocessing.
  if (payload.id && seenIds.has(payload.id)) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Payroc event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (payload.id) seenIds.add(payload.id);
  // Payroc expects exactly 200; anything else is retried five times.
  return NextResponse.json({ received: true }, { status: 200 });
}
