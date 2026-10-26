// Generated with: absorb-lms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAbsorbSignature } from '../../../lib/verify-absorb';

interface AbsorbWebhook {
  eventName?: string;
  [key: string]: unknown;
}

function handleEvent(body: AbsorbWebhook): void {
  const { eventName } = body;

  switch (eventName) {
    case 'UserCreated':
      console.log('User created', body);
      // TODO: GET the new learner from the Absorb Integration API and sync it
      break;

    case 'OnlineCourseActivated':
      console.log('Online course activated', body);
      break;

    case 'EnrollmentCompletedbyAdmin':
    case 'EnrollmentCompletedbyLearner':
      console.log(`Enrollment completed (${eventName})`, body);
      // TODO: mark the course complete in your system
      break;

    case 'CertificateAwarded':
      console.log('Certificate awarded', body);
      // TODO: fetch the certificate and notify the learner
      break;

    case 'CompetencyAwarded':
      console.log('Competency awarded', body);
      break;

    case 'CourseCreditsAwarded':
      console.log('Course credits awarded', body);
      break;

    case 'UserEnrolledinCoursebyAdmin':
    case 'UserEnrolledinCoursebyLearner':
      console.log(`User enrolled in course (${eventName})`, body);
      break;

    default:
      console.log(`Unhandled event: ${eventName}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes received (any content type); the signature covers them.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyAbsorbSignature(rawBody, request.headers.get('absorb-signature'))) {
    // Absorb's Test Webhook button sends a random signature, so it always lands here.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(body as AbsorbWebhook);
  } catch (err) {
    console.error('Error handling Absorb LMS event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
