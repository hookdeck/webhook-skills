// Generated with: nextcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNextcloudRequest } from '../../../lib/verify-nextcloud';

interface NextcloudNode {
  id?: number;
  path?: string;
}

interface NextcloudPayload {
  event?: {
    class?: string;
    node?: NextcloudNode;
    source?: NextcloudNode;
    target?: NextcloudNode;
    calendarId?: number;
    [key: string]: unknown;
  };
  user?: { uid?: string; displayName?: string } | null;
  time?: number;
}

function handleEvent(payload: NextcloudPayload): void {
  const cls = payload.event?.class;
  const uid = payload.user?.uid ?? null;
  const node = payload.event?.node;
  const shortName = cls?.split('\\').pop();

  switch (cls) {
    case 'OCP\\Files\\Events\\Node\\NodeCreatedEvent':
      console.log(`File created by ${uid}: ${node?.path}`);
      // TODO: index the new file or kick off processing
      break;

    case 'OCP\\Files\\Events\\Node\\NodeWrittenEvent':
      console.log(`File written by ${uid}: ${node?.path}`);
      // TODO: re-process the changed file
      break;

    case 'OCP\\Files\\Events\\Node\\NodeTouchedEvent':
      console.log(`File touched by ${uid}: ${node?.path}`);
      break;

    case 'OCP\\Files\\Events\\Node\\NodeDeletedEvent':
      // node.id is usually absent here; only node.path is present
      console.log(`File deleted by ${uid}: ${node?.path}`);
      // TODO: remove the file from your index
      break;

    case 'OCP\\Files\\Events\\Node\\NodeCopiedEvent':
    case 'OCP\\Files\\Events\\Node\\NodeRenamedEvent':
    case 'OCP\\Files\\Events\\Node\\NodeRestoredEvent':
      // two-node events carry event.source and event.target (either may lack an id)
      console.log(`${shortName} by ${uid}: ${payload.event?.source?.path} -> ${payload.event?.target?.path}`);
      // TODO: update your copy of the path
      break;

    case 'OCP\\SystemTag\\TagAssignedEvent':
    case 'OCP\\SystemTag\\TagUnassignedEvent':
      console.log(`${shortName} by ${uid}`);
      // TODO: sync tags
      break;

    case 'OCP\\Calendar\\Events\\CalendarObjectCreatedEvent':
    case 'OCP\\Calendar\\Events\\CalendarObjectUpdatedEvent':
    case 'OCP\\Calendar\\Events\\CalendarObjectDeletedEvent':
      console.log(`${shortName} by ${uid} (calendar ${payload.event?.calendarId})`);
      // TODO: sync the calendar object
      break;

    case 'OCA\\Forms\\Events\\FormSubmittedEvent':
      console.log(`Form submitted by ${uid}`);
      // TODO: process the submission
      break;

    default:
      console.log(`Unhandled event: ${cls}`);
  }
}

// httpMethod is a free string chosen when the webhook is registered, so every
// supported method shares one handler.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNextcloudRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET/DELETE may have no body.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as NextcloudPayload);
  } catch (err) {
    console.error('Error handling Nextcloud event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
