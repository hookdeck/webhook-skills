// Generated with: incode-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyIncodeRequest, eventName, IncodePayload } from '../../../lib/verify-incode';

function handleEvent(payload: IncodePayload): void {
  const event = eventName(payload);

  switch (event) {
    // Session webhooks (event_type)
    case 'SESSION_STARTED':
      console.log(`Session started: ${payload.interviewId}`);
      // TODO: mark the applicant as in progress
      break;

    case 'SESSION_PROGRESS':
      console.log(`Session progress: ${payload.interviewId}`);
      // TODO: track resumed sessions
      break;

    case 'SESSION_SUCCEEDED':
      console.log(`Session succeeded: ${payload.interviewId} (identity ${payload.identityId})`);
      // TODO: approve the applicant, fetch results with the Incode API
      break;

    case 'SESSION_FAILED':
      console.log(`Session failed: ${payload.interviewId} (${(payload.failureReasons || []).join(', ')})`);
      // TODO: reject or retry the applicant (payload.failureReasons)
      break;

    case 'SESSION_PENDING_REVIEW':
      console.log(`Session pending review: ${payload.interviewId}`);
      // TODO: queue for manual review
      break;

    // Identity Enrolled (eventType)
    case 'IDENTITY_ENROLLED':
      console.log(`Identity enrolled: ${payload.identityId}`);
      // TODO: link payload.identityId to your user record
      break;

    // Onboarding status webhook (onboardingStatus)
    case 'ID_VALIDATION_FINISHED':
    case 'ID_VALIDATION_FINISHED_SECOND_ID':
    case 'GOVERNMENT_VALIDATION_FINISHED':
    case 'FACE_VALIDATION_FINISHED':
    case 'POST_PROCESSING_FINISHED':
    case 'POST_PROCESSING_FINISHED_SECOND_ID':
      console.log(`Onboarding step finished: ${event} (${payload.interviewId})`);
      // TODO: optionally fetch partial results; wait for ONBOARDING_FINISHED for final data
      break;

    case 'ONBOARDING_FINISHED':
      console.log(`Onboarding finished: ${payload.interviewId}`);
      // TODO: fetch the final session results
      break;

    case 'MANUAL_REVIEW_APPROVED':
      console.log(`Manual review approved: ${payload.interviewId}`);
      // TODO: approve the applicant
      break;

    case 'MANUAL_REVIEW_REJECTED':
      console.log(`Manual review rejected: ${payload.interviewId}`);
      // TODO: reject the applicant
      break;

    case 'EXPIRED':
      console.log(`Session expired: ${payload.interviewId}`);
      // TODO: expire the pending applicant
      break;

    case 'DELETED':
      console.log(`Sessions deleted: ${(payload.interviewIds || []).join(', ')}`);
      // TODO: delete your copies of these sessions (note interviewIds, not interviewId)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyIncodeRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
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

  try {
    handleEvent(payload as IncodePayload);
  } catch (err) {
    console.error('Error handling Incode event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Incode retries unless it gets 200 with a JSON content type, or 204.
  return NextResponse.json({ success: true });
}
