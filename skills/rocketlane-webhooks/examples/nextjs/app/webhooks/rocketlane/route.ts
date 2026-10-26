// Generated with: rocketlane-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRocketlaneRequest } from '../../../lib/verify-rocketlane';

interface RocketlaneEvent {
  eventId?: string;
  resourceType?: string;
  eventType?: string;
  data?: { task?: { taskId?: number; taskName?: string } };
  changeLog?: { changedFields?: string[]; from?: unknown; to?: unknown };
}

function handleEvent(payload: RocketlaneEvent): void {
  switch (payload.eventType) {
    case 'TASK_CREATED':
      console.log(`Task created: ${payload.data?.task?.taskId} ${payload.data?.task?.taskName}`);
      // TODO: create the matching task in your system
      break;

    case 'TASK_UPDATED':
      console.log(`Task updated: ${payload.data?.task?.taskId}, changed: ${(payload.changeLog?.changedFields ?? []).join(', ')}`);
      // TODO: apply payload.changeLog.to to your copy of the task
      break;

    case 'TASK_DELETED':
      console.log(`Task deleted: ${payload.data?.task?.taskId}`);
      // TODO: remove the task from your system
      break;

    case 'PROJECT_CREATED':
    case 'PROJECT_UPDATED':
    case 'PROJECT_ARCHIVED':
    case 'PROJECT_DELETED':
      console.log(`${payload.eventType} (event ${payload.eventId})`);
      // TODO: sync the project
      break;

    case 'PHASE_CREATED':
    case 'PHASE_UPDATED':
    case 'PHASE_DELETED':
      console.log(`${payload.eventType} (event ${payload.eventId})`);
      // TODO: sync the phase
      break;

    default:
      console.log(`Unhandled Rocketlane event type: ${payload.eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRocketlaneRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic authentication' }, { status: 401 });
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
    handleEvent(payload as RocketlaneEvent);
  } catch (err) {
    console.error('Error handling Rocketlane webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Rocketlane counts only 200 or 204 as delivered, and times out after 10 seconds.
  return NextResponse.json({ received: true });
}
