// Generated with: soniox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySonioxRequest } from '../../../lib/verify-soniox';

interface SonioxPayload {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

function handleTranscription(payload: SonioxPayload): void {
  const { id, status } = payload;

  switch (status) {
    case 'completed':
      console.log(`Transcription completed: ${id}`);
      // TODO: fetch the transcript from the Soniox API by id
      break;

    case 'error':
      console.log(`Transcription failed: ${id}`);
      // TODO: look up the transcription by id, alert or retry
      break;

    default:
      console.log(`Unhandled status: ${status}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySonioxRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook auth header' }, { status: 401 });
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
    handleTranscription(payload as SonioxPayload);
  } catch (err) {
    console.error('Error handling Soniox webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
