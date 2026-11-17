// Generated with: digital-samba-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDigitalSambaRequest } from '../../../lib/verify-digital-samba';

interface DigitalSambaPayload {
  eventType?: string;
  sessionId?: string;
  roomId?: string;
  timestamp?: number;
  data?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: DigitalSambaPayload): void {
  const { eventType, sessionId, roomId } = payload;

  switch (eventType) {
    case 'participant_joined':
      console.log(`Participant joined room ${roomId}: ${payload.data?.name}`);
      // Update attendance (payload.data.participantId, payload.data.role)
      break;

    case 'participant_left':
      console.log(`Participant left room ${roomId}`);
      // Record the departure
      break;

    case 'session_started':
      console.log(`Session started: ${sessionId}`);
      // Mark the room as live
      break;

    case 'session_ended':
      console.log(`Session ended: ${sessionId}`);
      // Finalize attendance and billing
      break;

    case 'recording_started':
      console.log(`Recording started in session ${sessionId}`);
      // Show a recording indicator
      break;

    case 'recording_stopped':
      console.log(`Recording stopped in session ${sessionId}`);
      // Mark the recording as processing
      break;

    case 'recording_ready':
      console.log(`Recording ready for session ${sessionId}`);
      // Fetch the recording through the REST API
      break;

    case 'recording_deleted':
      console.log(`Recording deleted in session ${sessionId}`);
      // Remove the stored reference
      break;

    case 'session_summary_ready':
      console.log(`Session summary ready for session ${sessionId}`);
      // Fetch the summary through the REST API
      break;

    case 'session_transcript_ready':
      console.log(`Session transcript ready for session ${sessionId}`);
      // Fetch the transcript through the REST API
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDigitalSambaRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Authorization bearer secret' },
      { status: 401 }
    );
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
    handleEvent(payload as DigitalSambaPayload);
  } catch (err) {
    console.error('Error handling Digital Samba event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
