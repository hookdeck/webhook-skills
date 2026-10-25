// Generated with: jobadder-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyJobAdderRequest } from '../../../lib/verify-jobadder';

function handleEvent(payload: Record<string, unknown>): void {
  switch (payload.event) {
    case 'candidate_status_changed':
      console.log(`Candidate status changed (event ${payload.eventId})`);
      // TODO: sync the candidate's new status to your system
      break;

    case 'job_status_changed':
      console.log(`Job status changed (event ${payload.eventId})`);
      // TODO: update the job in your system
      break;

    case 'jobapplication_status_changed':
      console.log(`Job application status changed (event ${payload.eventId})`);
      // TODO: move the application along your pipeline
      break;

    case 'placement_approved':
      console.log(`Placement approved (event ${payload.eventId})`);
      // TODO: trigger onboarding or invoicing
      break;

    default:
      console.log(`Unhandled JobAdder event: ${payload.event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyJobAdderRequest(request.headers)) {
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
    console.error('Error handling JobAdder webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
