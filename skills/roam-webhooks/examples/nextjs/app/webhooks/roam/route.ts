// Generated with: roam-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { alreadySeen, markSeen } from '../../../lib/dedupe';

// Roam v1 envelope: the event payload is nested under data
interface RoamEvent {
  type:
    | 'chat.message'
    | 'chat.reaction'
    | 'meeting.started'
    | 'meeting.ended'
    | 'lobby.booked'
    | 'magicast.created'
    | 'onair.event.created'
    | string;
  eventId?: string;
  timestamp?: string;
  apiVersion?: string;
  data?: Record<string, any>;
}

// One Roam event can arrive as two POSTs with the same webhook-id: a legacy
// tagged-id body (type: "message") and the v1 envelope (type: "chat.message").
function isV1Envelope(event: RoamEvent): boolean {
  return typeof event?.type === 'string' && event.type.includes('.') && typeof event.data === 'object';
}

function handleEvent(event: RoamEvent) {
  const data = event.data ?? {};
  switch (event.type) {
    case 'chat.message':
      if (data.contentType === 'deleted') console.log(`Chat message deleted in chat ${data.chatId}`);
      else console.log(`Chat message in chat ${data.chatId} (version ${data.version})`);
      break;
    case 'chat.reaction':
      console.log(`Chat reaction event for chat ${data.chatId}`);
      break;
    case 'meeting.started':
      console.log(`Meeting started: ${data.id}`);
      break;
    case 'meeting.ended':
      console.log(`Meeting ended: ${data.title} (${data.id})`);
      break;
    case 'lobby.booked':
      console.log('Lobby booked');
      break;
    case 'magicast.created':
      console.log('Magicast created');
      break;
    case 'onair.event.created':
      console.log('On-Air event created');
      break;
    default:
      console.log(`Unhandled Roam event: ${event.type}`);
  }

  // TODO: acknowledge first, then do the real work in a background job
}

export async function POST(request: NextRequest) {
  const secret = process.env.ROAM_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error('ROAM_WEBHOOK_SIGNING_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');

  // Unsigned deliveries (no signing secret configured in Roam) lack these headers
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // Read the raw body (any content type) - verification must run on the exact bytes Roam sent
  const rawBody = await request.text();

  let event: RoamEvent;
  try {
    // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
    // rejects timestamps more than 5 minutes off, and returns the parsed payload.
    // Behind Hookdeck retries/replays, use the manual verifier in references/verification.md.
    event = new Webhook(secret).verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }) as RoamEvent;
  } catch (err) {
    console.error('Roam webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Legacy body of the same event: acknowledge and skip, the v1 body carries the same webhook-id
  if (!isV1Envelope(event)) {
    return NextResponse.json({ received: true, ignored: 'legacy body' });
  }

  // Dedupe on webhook-id (retries reuse it)
  if (alreadySeen(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
    markSeen(webhookId);
  } catch (err) {
    console.error('Error handling Roam webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Respond within 3 seconds; 2xx = delivered
  return NextResponse.json({ received: true });
}
