// Generated with: rudderstack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRudderstackRequest } from '../../../lib/verify-rudderstack';

type RudderEvent = Record<string, any>;

function handleEvent(event: RudderEvent): void {
  switch (event.type) {
    case 'track':
      console.log(`Track: ${event.event} (user ${event.userId || event.anonymousId})`);
      // TODO: handle the tracked event (event.event, event.properties)
      break;

    case 'identify':
      console.log(`Identify: user ${event.userId || event.anonymousId}`);
      // TODO: sync event.traits to your user store
      break;

    case 'page':
      console.log(`Page: ${event.name || event.properties?.url}`);
      // TODO: record the page view
      break;

    case 'screen':
      console.log(`Screen: ${event.name}`);
      // TODO: record the screen view
      break;

    case 'group':
      console.log(`Group: ${event.groupId}`);
      // TODO: sync event.traits to your account/group store
      break;

    case 'alias':
      console.log(`Alias: ${event.previousId} -> ${event.userId}`);
      // TODO: merge the two identities
      break;

    default:
      // Mappings can emit any shape, and warehouse sources send other message types.
      console.log(`Unhandled RudderStack payload (type: ${event.type})`);
  }
}

// The HTTP method is chosen in the destination settings, so every method shares one handler.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRudderstackRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="rudderstack"' } }
    );
  }

  // Read the raw text so any content type works. An empty body (e.g. GET) is valid.
  const raw = await request.text();
  let events: unknown[] = [];

  if (raw.trim() !== '') {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    // Batching sends a JSON array of events.
    events = Array.isArray(payload) ? payload : [payload];
    if (!events.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
      return NextResponse.json(
        { error: 'Expected a JSON object or an array of objects' },
        { status: 400 }
      );
    }
  }

  try {
    (events as RudderEvent[]).forEach(handleEvent);
  } catch (err) {
    console.error('Error handling RudderStack event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, events: events.length });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
