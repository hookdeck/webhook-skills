// Generated with: rubrik-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, normalizeEvent, type RubrikEvent } from '../../../lib/rubrik-auth';

function handleEvent(event: RubrikEvent) {
  // Status values come from Rubrik's ActivityStatusEnum.
  switch (event.status) {
    case 'Failure':
    case 'TaskFailure':
      console.log(`[rubrik] FAILED ${event.eventClass} on ${event.objectName}: ${event.message}`);
      // TODO: open an incident / page on-call
      break;
    case 'Success':
    case 'TaskSuccess':
      console.log(`[rubrik] Succeeded ${event.eventClass} on ${event.objectName}`);
      // TODO: record successful backup / recovery
      break;
    case 'PARTIAL_SUCCESS':
    case 'Warning':
      console.log(`[rubrik] Warning ${event.eventClass} on ${event.objectName}: ${event.message}`);
      break;
    case 'Canceled':
    case 'Canceling':
      console.log(`[rubrik] Canceled ${event.eventClass} on ${event.objectName}`);
      break;
    case 'Running':
    case 'Queued':
    case 'Info':
      console.log(`[rubrik] ${event.status}: ${event.message}`);
      break;
    default:
      console.log(`[rubrik] Unhandled status ${event.status}: ${event.message}`);
  }

  // Anomaly (ransomware) events deserve attention regardless of status.
  if (event.eventClass === 'Anomaly') {
    console.log(`[rubrik] ANOMALY detected on ${event.objectName}: ${event.message}`);
    // TODO: alert the security team
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
