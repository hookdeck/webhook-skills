// Generated with: proxyclick-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyProxyclickRequest } from '../../../lib/verify-proxyclick';

// ILLUSTRATIVE handler. No event-type field or payload attribute is documented in
// the pages this skill was written from, so nothing dispatches on a field. Check a
// real delivery before relying on any key.
function handleEvent(payload: Record<string, unknown>): void {
  console.log(`Proxyclick webhook received (top-level keys: ${Object.keys(payload).join(', ')})`);
  // TODO: act on the visit or visitor data (check-in, check-out, visit created/updated/deleted)
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyProxyclickRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
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
    console.error('Error handling Proxyclick webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
