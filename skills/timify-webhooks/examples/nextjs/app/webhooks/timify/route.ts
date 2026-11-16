// Generated with: timify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTimifyRequest } from '../../../lib/verify-timify';

/**
 * TIMIFY's webhook overview names each webhook (Customers, Event, Resource, ...) and its type
 * (Created, Updated, Deleted), but documents no payload fields, so this handler doesn't guess
 * which field carries them. Give each webhook scope its own subscription and Server URL, as
 * TIMIFY suggests, or capture one delivery and branch on the field it actually uses.
 */
function handleEvent(payload: Record<string, unknown>): void {
  console.log(`TIMIFY webhook received with fields: ${Object.keys(payload).join(', ')}`);
  // Process the delivery here
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTimifyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing TIMIFY webhook header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
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
    console.error('Error handling TIMIFY event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
