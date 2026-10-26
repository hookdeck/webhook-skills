// Generated with: ukg-ready-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyUkgReadyRequest } from '../../../lib/verify-ukg-ready';

// The payload shape is chosen per subscription and shown only in the UKG Ready app, and it
// carries no documented event-type field (ACCOUNT_CREATED / ACCOUNT_UPDATED are subscription
// categories). Treat it as the latest values of the selected fields.
function handlePayload(payload: Record<string, unknown>): void {
  console.log(`UKG Ready webhook with fields: ${Object.keys(payload).join(', ')}`);
  // TODO: sync the changed employee/account fields to your system (idempotently)
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyUkgReadyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
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
    handlePayload(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling UKG Ready webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
