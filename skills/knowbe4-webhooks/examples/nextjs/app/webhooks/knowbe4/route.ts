// Generated with: knowbe4-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKnowbe4Request } from '../../../lib/verify-knowbe4';

/**
 * The body is defined by your own webhook configuration and KnowBe4 documents no event
 * field. ILLUSTRATIVE: this example reads an `event_type` string, e.g. the UI label
 * "Phish Failure Removed". Inspect a real delivery and adapt.
 */
function handleEvent(payload: Record<string, unknown>): void {
  const eventType = typeof payload.event_type === 'string' ? payload.event_type : null;

  switch (eventType) {
    case 'Phish Failure Removed':
      console.log('KSAT: phish failure removed');
      // TODO: update the user's risk record in your system
      break;

    default:
      console.log(`KnowBe4 payload received${eventType ? ` (${eventType})` : ''}`);
      // TODO: route PhishER message data or other KSAT events here
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyKnowbe4Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
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
    console.error('Error handling KnowBe4 webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
