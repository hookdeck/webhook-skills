// Generated with: rubrik-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, normalizeEvent, type RubrikEvent } from '../../../lib/rubrik-auth';

function handleEvent(event: RubrikEvent) {
  // Only Success, Failure, PartialSuccess and Canceled report a final outcome.
  // Every other status (Running, Queued, Canceling, TaskSuccess, TaskFailure,
  // Info, Warning) describes work in progress, so log it and move on.
  switch (event.status) {
    case 'Failure':
      console.log(`[rubrik] FAILED ${event.eventClass} on ${event.objectName}: ${event.message}`);
      break;
    case 'Success':
      console.log(`[rubrik] Succeeded ${event.eventClass} on ${event.objectName}`);
      break;
    case 'PartialSuccess':
      console.log(`[rubrik] Partial success ${event.eventClass} on ${event.objectName}: ${event.message}`);
      break;
    case 'Canceled':
      console.log(`[rubrik] Canceled ${event.eventClass} on ${event.objectName}`);
      break;
    default:
      console.log(`[rubrik] In progress (${event.status}): ${event.message}`);
  }

  // Decide what needs attention on severity, not status: a critical ransomware
  // detection arrives with status Success, because the scan succeeded.
  if (event.severity === 'critical') {
    console.log(`[rubrik] CRITICAL ${event.eventClass} on ${event.objectName}: ${event.message}`);
  }

  // Anomaly is the ActivityTypeEnum spelling of the ANOMALY class.
  if (event.eventClass === 'Anomaly') {
    console.log(`[rubrik] ANOMALY detected on ${event.objectName}: ${event.message}`);
  }
}

export async function POST(request: NextRequest) {
  // Rubrik webhooks are unsigned: authenticate the configured header/credentials.
  if (!authenticateRequest(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const event = normalizeEvent(payload as Record<string, any>);
  try {
    handleEvent(event);
  } catch (err) {
    console.error('[rubrik] handler error', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Rubrik retries only 3 times (1s, 5s, 10s): respond quickly.
  return NextResponse.json({ received: true, id: event.id ?? null });
}
