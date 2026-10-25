// Generated with: streak-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyStreakRequest } from '../../../lib/verify-streak';

type StreakObject = Record<string, unknown>;

// Streak does not put the event name in the body, so register one URL per webhook:
// POST /webhooks/streak?event=BOX_CREATE
function handleEvent(event: string | null, objects: StreakObject[]): void {
  switch (event) {
    case 'BOX_CREATE':
      console.log(`Box created (${objects.length})`);
      // TODO: sync the new box (name, pipelineKey, stageKey)
      break;

    case 'BOX_EDIT':
      console.log(`Box edited (${objects.length})`);
      // TODO: refresh custom fields, notes, assignees or name
      break;

    case 'BOX_CHANGE_STAGE':
      console.log(`Box changed stage (${objects.length})`);
      // TODO: react to the new stageKey
      break;

    case 'BOX_CHANGE_PIPELINE':
      console.log(`Box changed pipeline (${objects.length})`);
      break;

    case 'BOX_DELETE':
      console.log(`Box deleted (${objects.length})`);
      // TODO: remove the box from your system
      break;

    case 'BOX_NEW_EMAIL_ADDRESS':
      console.log(`Box got a new email address (${objects.length})`);
      break;

    case 'STAGE_CREATE':
      console.log(`Stage created (${objects.length})`);
      break;

    case 'COMMENT_CREATE':
      console.log(`Comment created (${objects.length})`);
      // TODO: mirror the comment
      break;

    case 'MEETING_CREATE':
    case 'MEETING_UPDATE':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the meeting note or call log
      break;

    case 'TASK_CREATE':
    case 'TASK_COMPLETE':
    case 'TASK_DUE':
    case 'TASK_UPDATED':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the task
      break;

    case 'CONTACT_CREATE':
    case 'CONTACT_UPDATE':
    case 'CONTACT_DELETE':
    case 'ORG_CREATE':
    case 'ORG_UPDATE':
    case 'ORG_DELETE':
      console.log(`${event} (${objects.length})`);
      // TODO: sync the contact or organization
      break;

    default:
      console.log(`Unhandled event: ${event || '(none, add ?event=NAME to the webhook URL)'}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyStreakRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-Streak-Webhook-Token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Streak sends the updated object(s) in an array; tolerate a single object too.
  const objects = Array.isArray(payload) ? payload : [payload];
  const valid = objects.every((o) => o && typeof o === 'object' && !Array.isArray(o));
  if (!valid) {
    return NextResponse.json({ error: 'Expected a JSON object or array of objects' }, { status: 400 });
  }

  try {
    handleEvent(request.nextUrl.searchParams.get('event'), objects as StreakObject[]);
  } catch (err) {
    console.error('Error handling Streak event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Must be 200. 410 Gone deletes the webhook; anything else is retried with backoff.
  return NextResponse.json({ received: true });
}
