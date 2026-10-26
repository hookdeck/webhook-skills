// Generated with: halo-psa-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHaloPsaRequest } from '../../../lib/verify-halo-psa';

type HaloPayload = Record<string, unknown>;

/**
 * Halo's docs don't name the event-name or object-id properties in text, so these field
 * names are illustrative: check a real delivery in Halo's Deliveries tab or Hookdeck.
 */
function pick(payload: HaloPayload, ...names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined) return payload[name];
  }
  return undefined;
}

function handleEvent(payload: HaloPayload): void {
  const event = pick(payload, 'event', 'eventName', 'event_name');
  const objectId = pick(payload, 'object_id', 'objectId');

  switch (event) {
    case 'New Ticket Logged':
      console.log(`New ticket logged: ${objectId}`);
      // TODO: create the ticket in your system
      break;

    case 'Ticket Reassigned':
      console.log(`Ticket reassigned: ${objectId}`);
      // TODO: notify the new assignee
      break;

    case 'Document deleted on a Ticket':
    case 'Document edited on a Ticket':
      console.log(`${event}: ${objectId}`);
      // TODO: refresh the ticket's attachments
      break;

    default:
      console.log(`Unhandled event: ${event} (object: ${objectId})`);
  }
}

const isObject = (v: unknown): v is HaloPayload =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyHaloPsaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // With batching enabled Halo sends a JSON array of objects instead of one object.
  const events: unknown[] = Array.isArray(payload) ? payload : [payload];
  if (!events.every(isObject)) {
    return NextResponse.json(
      { error: 'Expected a JSON object or an array of objects' },
      { status: 400 }
    );
  }

  try {
    (events as HaloPayload[]).forEach(handleEvent);
  } catch (err) {
    console.error('Error handling HaloPSA event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
