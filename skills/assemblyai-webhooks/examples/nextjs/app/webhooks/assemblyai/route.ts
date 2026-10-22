// Generated with: assemblyai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAssemblyAIRequest } from '../../../lib/verify-assemblyai';

/**
 * The payload only carries { transcript_id, status }. Fetch the transcript with
 * GET /v2/transcript/{transcript_id} to get the text or the error message.
 */
interface AssemblyAIPayload {
  transcript_id?: string;
  status?: string;
}

function handleEvent(payload: AssemblyAIPayload): void {
  const { transcript_id: transcriptId, status } = payload;

  switch (status) {
    case 'completed':
      console.log(`Transcript completed: ${transcriptId}`);
      // TODO: GET https://api.assemblyai.com/v2/transcript/{id} and use .text
      break;

    case 'error':
      console.log(`Transcript failed: ${transcriptId}`);
      // TODO: GET the transcript and read its .error field
      break;

    default:
      console.log(`Unhandled status: ${status} (transcript: ${transcriptId})`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body. A 4xx tells AssemblyAI the
  // delivery failed and must not be retried.
  if (!verifyAssemblyAIRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook auth header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as AssemblyAIPayload);
  } catch (err) {
    console.error('Error handling AssemblyAI event:', err);
    // A 5xx (or no 2xx within 10s) makes AssemblyAI retry, up to 10 attempts.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
