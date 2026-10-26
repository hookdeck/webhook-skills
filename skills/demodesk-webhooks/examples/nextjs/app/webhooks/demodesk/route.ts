// Generated with: demodesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDemodeskRequest } from '../../../lib/verify-demodesk';

interface DemodeskPayload {
  meta?: { event?: { action?: string } };
  [key: string]: unknown;
}

function handleEvent(payload: DemodeskPayload): void {
  const action = payload.meta?.event?.action;

  switch (action) {
    case 'demo.scheduled':
      console.log('Demo scheduled');
      // TODO: create the meeting in your CRM
      break;

    case 'demo.rescheduled':
      console.log('Demo rescheduled');
      // TODO: update the meeting time
      break;

    case 'demo.event_response_updated':
      console.log('Demo invitation response updated');
      // TODO: record the attendee's response
      break;

    case 'demo.handovered':
      console.log('Demo handed over');
      // TODO: reassign the meeting owner
      break;

    case 'demo.canceled':
      console.log('Demo canceled');
      // TODO: cancel the meeting downstream
      break;

    case 'demo.started':
      console.log('Demo started');
      // TODO: mark the meeting as in progress
      break;

    case 'demo.call_note_updated':
      console.log('Demo call note updated');
      // TODO: sync the call note
      break;

    case 'demo.ended':
      console.log('Demo ended');
      // TODO: log the outcome (it can fire again if a meeting is restarted)
      break;

    case 'recording.uploaded':
      console.log('Recording uploaded');
      // TODO: fetch the recording through the Demodesk API
      break;

    case 'recording.transcription_postprocessed':
      console.log('Recording transcription post-processed');
      // TODO: fetch the transcript through the Demodesk API
      break;

    default:
      console.log(`Unhandled event: ${action}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDemodeskRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
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
    handleEvent(payload as DemodeskPayload);
  } catch (err) {
    console.error('Error handling Demodesk event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
