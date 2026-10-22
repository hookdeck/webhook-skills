// Generated with: coterie-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyCoterieRequest } from '../../../lib/verify-coterie';

function handleEvent(payload: Record<string, unknown>): void {
  switch (classify(payload)) {
    case 'application':
      console.log(`Application ${payload.applicationId}: ${payload.Status}`);
      // TODO: sync the application status (e.g. ReadyToQuote) to your system
      break;

    case 'quote':
      console.log(`Quote ${payload.quoteId} (${payload.PolicyType}): premium ${payload.Premium}`);
      // TODO: show the quote to the customer
      break;

    case 'policy':
      console.log(`Policy ${payload.PolicyNumber}: ${payload.Status}`);
      // TODO: record the policy status (e.g. Pending)
      break;

    default:
      console.log('Unhandled Coterie payload (no applicationId, quoteId or PolicyId)');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCoterieRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authentication header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Coterie webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
