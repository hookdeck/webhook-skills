// Generated with: speechmatics-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySpeechmaticsRequest } from '../../../lib/verify-speechmatics';

interface SpeechmaticsNotification {
  jobId: string | null;
  status: string | null;
  contentType: string;
  body: Uint8Array;
}

function describeBody(contentType: string, body: Uint8Array): string {
  if (body.length === 0) return 'no body';
  return `${contentType || 'unknown type'}, ${body.length} bytes`;
}

/**
 * Speechmatics appends ?id=<job id>&status=<status> to your URL. The body is whatever
 * `contents` you requested (JSON, text, multipart) and may be empty, so dispatch on the query.
 */
function handleEvent({ jobId, status, contentType, body }: SpeechmaticsNotification): void {
  switch (status) {
    case 'success':
      console.log(`Job succeeded: ${jobId} (${describeBody(contentType, body)})`);
      // TODO: store the transcript from `body`, or fetch it from the API by job id
      break;

    case 'error':
      console.log(`Job failed: ${jobId} (${describeBody(contentType, body)})`);
      // TODO: only jobinfo is sent on error; read the job's errors from the API
      break;

    case 'fetch_error':
      console.log(`Could not fetch the data file for job: ${jobId}`);
      break;

    case 'trim_error':
      console.log(`Could not process the audio file for job: ${jobId}`);
      break;

    default:
      console.log(`Unhandled status: ${status} (job: ${jobId})`);
  }
}

// The notification method is user-chosen: POST (default) or PUT.
async function receive(request: NextRequest) {
  // Authenticate before reading the (possibly large) body.
  if (!verifySpeechmaticsRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook auth header' }, { status: 401 });
  }

  // Read the body raw, whatever the content type; it may be empty.
  const body = new Uint8Array(await request.arrayBuffer());
  const contentType = (request.headers.get('content-type') || '').toLowerCase();

  // Parse only after authentication, and only JSON content types.
  if (body.length > 0 && /json/.test(contentType)) {
    try {
      JSON.parse(new TextDecoder().decode(body));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  const { searchParams } = new URL(request.url);
  try {
    handleEvent({
      jobId: searchParams.get('id'),
      status: searchParams.get('status'),
      contentType,
      body,
    });
  } catch (err) {
    console.error('Error handling Speechmatics notification:', err);
    // A non-2xx makes Speechmatics retry until its timeout.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = receive;
export const PUT = receive;
