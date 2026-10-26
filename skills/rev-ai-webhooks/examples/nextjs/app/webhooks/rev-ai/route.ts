// Generated with: rev-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRevAiRequest } from '../../../lib/verify-rev-ai';

function handleEvent(payload: Record<string, unknown>): void {
  const job = payload.job as Record<string, unknown> | undefined;
  if (!job || typeof job !== 'object') {
    console.log('Unhandled Rev AI payload (no job object)');
    return;
  }

  switch (job.status) {
    case 'transcribed':
      console.log(`Job ${job.id} transcribed (${job.duration_seconds}s)`);
      // TODO: fetch the transcript with GET /speechtotext/v1/jobs/{id}/transcript
      break;

    case 'failed':
      console.log(`Job ${job.id} failed: ${job.failure} - ${job.failure_detail}`);
      // TODO: alert, or resubmit once the cause (e.g. download_failure) is fixed
      break;

    default:
      console.log(`Unhandled Rev AI job status: ${job.status}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRevAiRequest(request.headers)) {
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
    console.error('Error handling Rev AI webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Rev AI retries every 30 minutes for 24 hours until it receives a 200.
  return NextResponse.json({ received: true });
}
