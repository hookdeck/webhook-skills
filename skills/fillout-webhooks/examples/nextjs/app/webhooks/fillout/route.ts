// Generated with: fillout-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  answersById,
  dedupeKey,
  parseFilloutPayload,
  verifyFilloutAuth,
  type FilloutSubmission,
} from '../../../lib/fillout';

// Use a database or cache in production; a Set is enough to show the idea.
const processed = new Set<string>();

function handleSubmission(submission: FilloutSubmission) {
  console.log(
    `Form submission ${submission.submissionId} at ${submission.submissionTime}:`,
    answersById(submission.questions)
  );
  for (const booking of submission.scheduling ?? []) {
    console.log(`Booking by ${booking.value.fullName} starting ${booking.value.eventStartTime}`);
  }
  if (submission.quiz) {
    console.log(`Quiz score ${submission.quiz.score}/${submission.quiz.maxScore}`);
  }
  // TODO: save the submission, notify your team, etc.
}

export async function POST(request: NextRequest) {
  const token = process.env.FILLOUT_WEBHOOK_TOKEN;
  if (!token) {
    console.error('FILLOUT_WEBHOOK_TOKEN is not set; rejecting webhook');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }

  // Authenticate before reading the body
  if (!verifyFilloutAuth(request.headers.get('authorization'), token)) {
    return NextResponse.json(
      { error: 'Invalid or missing Authorization header' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const payload = parseFilloutPayload(body as Record<string, unknown>);
  const key = dedupeKey(payload);
  if (key && processed.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (payload.kind === 'submission') {
      handleSubmission(payload.submission);
    } else {
      console.log('Form submission (Advanced mode mapped body):', payload.fields);
      // TODO: read the keys you mapped in Fillout's Body section
    }
  } catch (err) {
    console.error('Error handling Fillout submission:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  if (key) processed.add(key);
  return NextResponse.json({ received: true });
}
