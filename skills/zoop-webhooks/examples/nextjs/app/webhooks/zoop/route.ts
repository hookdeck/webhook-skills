// Generated with: zoop-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { processEvent, verifyZoopRequest, type ZoopEvent } from '../../../lib/zoop';

// Only POST is exported, so other methods get 405.
export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyZoopRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let event: unknown;
  try {
    // Read the raw text so any content type works.
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event) ||
    typeof (event as { type?: unknown }).type !== 'string'
  ) {
    return NextResponse.json({ error: 'Expected an event object with a type' }, { status: 400 });
  }

  // Zoop waits 1 second for a response and retries after 10 minutes: acknowledge first,
  // then process. In production, push the event onto a queue here instead.
  setImmediate(() => {
    try {
      processEvent(event as ZoopEvent);
    } catch (err) {
      console.error('Error handling Zoop webhook:', err);
    }
  });

  return NextResponse.json({ received: true });
}
