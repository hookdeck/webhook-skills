// Generated with: pingone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseEvents, verifyPingOneRequest, type PingOneEvent } from '../../../lib/verify-pingone';

/**
 * Each audit event has an `action.type` such as USER.CREATED. PingOne defines many more
 * (see the Audit Reporting Events reference); subscribe only to the ones you handle.
 */
function handleEvent(event: PingOneEvent): void {
  const type = event.action?.type;
  const actor = event.actors?.user?.name;

  switch (type) {
    case 'USER.CREATED':
      console.log(`User created (event ${event.id})`);
      // TODO: provision the user in your system
      break;

    case 'USER.UPDATED':
      console.log(`User updated (event ${event.id})`);
      // TODO: sync the changed attributes
      break;

    case 'USER.DELETED':
      console.log(`User deleted (event ${event.id})`);
      // TODO: deprovision the user
      break;

    case 'AUTHENTICATION.CREATED':
      console.log(`Authentication recorded for ${actor ?? 'unknown actor'} (event ${event.id})`);
      // TODO: record the sign-in
      break;

    case 'PASSWORD.RESET':
      console.log(`Password reset (event ${event.id})`);
      // TODO: notify the user
      break;

    default:
      console.log(`Unhandled event: ${type} (id: ${event.id})`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPingOneRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  // Read as text so any content type works (JSON_ARRAY and ND_JSON).
  let events: PingOneEvent[];
  try {
    events = parseEvents(await request.text());
  } catch {
    return NextResponse.json(
      { error: 'Invalid body: expected a JSON array or ND_JSON of events' },
      { status: 400 }
    );
  }

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling PingOne event:', err);
    // PingOne retries the same events until it gets a 200.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: events.length });
}
