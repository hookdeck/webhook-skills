// Generated with: lokalise-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLokaliseRequest } from '../../../lib/verify-lokalise';

/**
 * Event names are the `event` field of the JSON body (also sent in the X-Event header).
 * See https://developers.lokalise.com/docs/webhook-events
 */
interface LokalisePayload {
  event: string;
  action?: string;
  project?: { id?: string; name?: string; branch?: string };
  user?: { email?: string; full_name?: string };
  translation?: { id?: number; value?: string; previous_value?: string };
  translations?: unknown[];
  language?: { iso?: string };
  key?: { id?: number; name?: string };
  keys?: unknown[];
  task?: { id?: number; title?: string };
}

function handleEvent(payload: LokalisePayload): void {
  const { event, project, user } = payload;

  switch (event) {
    case 'project.translation.updated':
      console.log(
        `Translation updated in ${project?.name} (${payload.language?.iso}): ` +
          `${payload.key?.name} = "${payload.translation?.value}"`
      );
      // TODO: sync the changed string to your app or CDN
      break;

    case 'project.translations.updated':
      console.log(`${payload.translations?.length} translations updated via ${payload.action}`);
      // TODO: sync the bulk change (up to 300 translations per event)
      break;

    case 'project.key.added':
      console.log(`Key added: ${payload.key?.name} by ${user?.email}`);
      break;

    case 'project.keys.added':
      console.log(`${payload.keys?.length} keys added via ${payload.action}`);
      // TODO: register the new keys (up to 300 per event)
      break;

    case 'project.key.modified':
    case 'project.keys.modified':
      console.log(`Keys modified in ${project?.name}`);
      // TODO: refresh the affected keys
      break;

    case 'project.keys.deleted':
      console.log(`${payload.keys?.length} keys deleted in ${project?.name}`);
      // TODO: remove the keys from your app
      break;

    case 'project.task.closed':
      console.log(`Task closed: ${payload.task?.title} (${payload.task?.id})`);
      // TODO: pull the finished translations
      break;

    case 'project.imported':
      console.log(`Files imported into ${project?.name}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyLokaliseRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret' }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    // Lokalise sends a ping when a webhook is created; it only needs a 2xx.
  }

  const event = (payload as LokalisePayload | null)?.event;
  if (!payload || typeof payload !== 'object' || typeof event !== 'string') {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    handleEvent(payload as LokalisePayload);
  } catch (err) {
    console.error('Error handling Lokalise event:', err);
    // Non-2xx (or no reply within 8 seconds) makes Lokalise retry for up to 24 hours.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
