// Generated with: sevalla-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySevallaRequest } from '../../../lib/verify-sevalla';

interface SevallaPayload {
  webhook_id?: string;
  event_id?: string;
  event_delivery_id?: string;
  type?: string;
  data?: Record<string, any>;
}

// event_id is the same on every retry. Use a shared store (Redis, a database) in production.
const seenEvents = new Set<string>();

function handleEvent(payload: SevallaPayload): void {
  const { type } = payload;
  const data = payload.data ?? {};

  switch (type) {
    case 'APP_CREATE':
      console.log(`Application created: ${data.display_name} (${data.id})`);
      // TODO: register the application in your inventory
      break;

    case 'APP_DEPLOY':
      console.log(`Application deployment ${data.status}: ${data.app_display_name} (${data.deployment_id})`);
      // TODO: notify chat on 'failed', run tests on 'success' (data.is_preview marks preview apps)
      break;

    case 'APP_UPDATE':
      console.log(`Application updated: ${data.display_name} (${data.id})`);
      // TODO: refresh your inventory
      break;

    case 'APP_DELETE':
      console.log(`Application deleted: ${data.display_name} (${data.id})`);
      // TODO: clean up
      break;

    case 'STATIC_SITE_CREATE':
      console.log(`Static site created: ${data.display_name} (${data.id})`);
      // TODO: register the static site
      break;

    case 'STATIC_SITE_DEPLOY':
      console.log(`Static site deployment ${data.status}: ${data.static_site_display_name} (${data.deployment_id})`);
      // TODO: purge caches or notify on 'success'
      break;

    case 'STATIC_SITE_UPDATE':
      console.log(`Static site updated: ${data.display_name} (${data.id})`);
      // TODO: refresh your inventory
      break;

    case 'STATIC_SITE_DELETE':
      console.log(`Static site deleted: ${data.display_name} (${data.id})`);
      // TODO: clean up
      break;

    case 'DATABASE_CREATE':
    case 'DATABASE_UPDATE':
    case 'DATABASE_DELETE':
      // Selectable in the dashboard but not sent by Sevalla at the moment.
      console.log(`Database event: ${type}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySevallaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing svl-signature' }, { status: 401 });
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

  const event = payload as SevallaPayload;
  if (event.event_id && seenEvents.has(event.event_id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Sevalla event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.event_id) seenEvents.add(event.event_id);
  return NextResponse.json({ received: true });
}
