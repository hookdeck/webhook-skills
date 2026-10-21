// Generated with: recall-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  getSignatureHeaders,
  verifyRecallSignature,
  type RecallEvent,
} from '../../../lib/recall-signature';

function handleEvent(event: RecallEvent) {
  const data = event.data ?? {};

  switch (event.event) {
    // Bot status change (Svix webhooks)
    case 'bot.joining_call':
    case 'bot.in_waiting_room':
    case 'bot.in_call_not_recording':
    case 'bot.in_call_recording':
    case 'bot.call_ended':
      console.log(`Bot ${data.bot?.id} status: ${data.data?.code}`);
      break;
    case 'bot.done':
      // Media is uploaded and ready to download if the bot recorded
      console.log(`Bot ${data.bot?.id} done`);
      break;
    case 'bot.fatal':
      console.log(`Bot ${data.bot?.id} fatal: ${data.data?.sub_code}`);
      break;

    // Recording and media artifact status (Svix webhooks)
    case 'recording.done':
      console.log(`Recording ${data.recording?.id} done`);
      break;
    case 'recording.failed':
      console.log(`Recording ${data.recording?.id} failed: ${data.data?.sub_code}`);
      break;
    case 'transcript.done':
      // Fetch the transcript via the API using data.transcript.id
      console.log(`Transcript ${data.transcript?.id} done`);
      break;
    case 'transcript.failed':
      console.log(`Transcript ${data.transcript?.id} failed: ${data.data?.sub_code}`);
      break;

    // Calendar V2 (Svix webhooks)
    case 'calendar.update':
      console.log(`Calendar ${data.calendar_id} updated; re-fetch it`);
      break;
    case 'calendar.sync_events':
      console.log(`Calendar ${data.calendar_id} events changed since ${data.last_updated_ts}`);
      break;

    // Real-time endpoint events (configured per bot in recording_config)
    case 'participant_events.join':
    case 'participant_events.leave':
      console.log(`${event.event}: ${data.data?.participant?.name}`);
      break;
    case 'transcript.data':
      console.log('Transcript utterance received for bot', data.bot?.id);
      break;

    default:
      console.log('Unhandled Recall.ai event:', event.event);
  }
}

export async function POST(request: NextRequest) {
  // CRITICAL: read the raw body; Recall.ai signed these exact bytes
  const rawBody = await request.text();

  const result = verifyRecallSignature(rawBody, request.headers, process.env.RECALL_WEBHOOK_SECRET);
  if (!result.valid) {
    console.error('Recall.ai webhook verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let event: RecallEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // webhook-id (or svix-id) is stable across retries: use it as the idempotency key.
  // In production: persist the event, return 2xx within 15s, process async.
  const { id } = getSignatureHeaders(request.headers);
  console.log('Recall.ai event', id, event.event);
  handleEvent(event);

  return NextResponse.json({ received: true });
}
