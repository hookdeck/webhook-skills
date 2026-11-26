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

  // Absorb's docs show only UserCreated and CertificateAwarded on the wire, so the casing
  // of the other names is untested. Compare case-insensitively.
  switch (String(eventName ?? '').toLowerCase()) {
    case 'usercreated':
      console.log('User created', body);
      // GET the new learner from the Absorb Integration API and sync it
      break;

    case 'onlinecourseactivated':
      console.log('Online course activated', body);
      break;

    case 'enrollmentcompletedbyadmin':
    case 'enrollmentcompletedbylearner':
      console.log(`Enrollment completed (${eventName})`, body);
      // Mark the course complete in your system
      break;

    case 'certificateawarded':
      console.log('Certificate awarded', body);
      // Fetch the certificate and notify the learner
      break;

    case 'competencyawarded':
      console.log('Competency awarded', body);
      break;

    case 'coursecreditsawarded':
      console.log('Course credits awarded', body);
      break;

    case 'userenrolledincoursebyadmin':
    case 'userenrolledincoursebylearner':
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
