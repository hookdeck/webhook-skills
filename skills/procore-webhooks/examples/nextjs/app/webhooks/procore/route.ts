// Generated with: procore-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyProcoreRequest } from '../../../lib/verify-procore';

function handleEvent(payload: Record<string, unknown>): void {
  // Payload formats v2.0 and v3.0 use event_type and resource_name; v4.0 renames them
  // to reason and resource_type.
  const eventType = payload.event_type ?? payload.reason;
  const resource = payload.resource_name ?? payload.resource_type;
  const resourceId = payload.resource_id;

  switch (eventType) {
    case 'create':
      console.log(`${resource} ${resourceId} created`);
      // Fetch the new record via the Procore REST API and sync it
      break;

    case 'update':
      console.log(`${resource} ${resourceId} updated`);
      // Refresh your copy of the record
      break;

    case 'delete':
      console.log(`${resource} ${resourceId} deleted`);
      // Remove or archive your copy of the record
      break;

    default:
      console.log(`Unhandled Procore event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyProcoreRequest(request.headers)) {
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
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Procore webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
