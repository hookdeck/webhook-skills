// Generated with: 100ms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verify100msRequest, seenEventIds } from '../../../lib/verify-100ms';

interface HundredMsEvent {
  version?: string;
  id?: string;
  app_id?: string;
  account_id?: string;
  template_id?: string;
  timestamp?: string;
  type: string;
  data?: Record<string, unknown>;
}

function handleEvent(event: HundredMsEvent): void {
  const { type } = event;
  const data = (event.data ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'session.open.success':
      console.log(`Session opened: ${data.session_id} (room ${data.room_name})`);
      // TODO: mark the session as live
      break;

    case 'session.close.success':
      console.log(`Session closed: ${data.session_id} after ${data.session_duration}s`);
      // TODO: record session duration for analytics
      break;

    case 'peer.join.success':
      console.log(`Peer joined: ${data.user_name} (${data.peer_id}) as ${data.role}`);
      // TODO: record attendance
      break;

    case 'peer.leave.success':
      console.log(`Peer left: ${data.user_name} (${data.peer_id})`);
      // TODO: close the attendance record
      break;

    case 'peer.join.failure':
    case 'peer.leave.failure':
    case 'room.end.failure':
    case 'role.change.failure':
      console.log(`Event failed: ${type}`);
      // TODO: alert or investigate (data.error)
      break;

    case 'room.end.success':
      console.log(`Room ended: ${data.room_id}`);
      // TODO: finalize the room
      break;

    case 'role.change.success':
      console.log(`Role changed for peer ${data.peer_id}`);
      // TODO: update permissions in your app
      break;

    case 'recording.success':
    case 'track.recording.success':
    case 'stream.recording.success':
    case 'beam.recording.success':
    case 'hls.recording.success':
      console.log(`Recording ready: ${type}`);
      // TODO: fetch the asset from data.location or data.recording_path
      break;

    case 'recording.failed':
    case 'track.recording.failure':
    case 'stream.recording.failure':
    case 'beam.failure':
    case 'hls.failure':
      console.log(`Recording or streaming failed: ${type}`);
      // TODO: alert (data.error)
      break;

    case 'track.recording.started.success':
    case 'beam.started.success':
    case 'beam.stopped.success':
    case 'hls.started.success':
    case 'hls.stopped.success':
      console.log(`Streaming or recording state changed: ${type}`);
      // TODO: update UI state (data.room_id, data.session_id)
      break;

    case 'transcription.started.success':
    case 'transcription.success':
    case 'transcription.failure':
      console.log(`Transcription event: ${type}`);
      // TODO: fetch or flag the transcript
      break;

    case 'ingest.start.success':
    case 'ingest.end.success':
    case 'ingest.start.failure':
    case 'ingest.failure':
      console.log(`RTMP ingest event: ${type}`);
      break;

    case 'sip.start.success':
    case 'sip.start.failure':
    case 'sip.end.success':
    case 'sip.end.failure':
      console.log(`SIP call event: ${type}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verify100msRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = payload as HundredMsEvent;
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Expected a JSON object with a type' }, { status: 400 });
  }

  // 100ms retries three times on any non-200, so dedupe on the event id.
  if (event.id && seenEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling 100ms event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.id) seenEventIds.add(event.id);
  return NextResponse.json({ received: true });
}
