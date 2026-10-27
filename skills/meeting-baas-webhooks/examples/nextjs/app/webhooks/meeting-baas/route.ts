// Generated with: meeting-baas-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.MEETING_BAAS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('MEETING_BAAS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Meeting BaaS (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Meeting BaaS webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope is {event, data}: the event name is the top-level `event`.
  // `extra` echoes what you set on the bot: inside `data` for most events, beside `data` for bot.chat_message.
  const type: string = event.event;
  const data: Record<string, any> = event.data ?? {};
  const extra = data.extra ?? event.extra;
  // Deliveries can repeat and arrive out of order: deduplicate on the `svix-id` header.
  console.log(`Received Meeting BaaS webhook ${id}: ${type}`);

  switch (type) {
    case 'bot.status_change':
      // data.status.code is the new status, e.g. in_call_recording; data.status.error_message on failures
      console.log('Bot status:', data.bot_id, data.status?.code, extra);
      break;
    case 'bot.completed':
      // Artifact URLs are presigned and valid for 4 hours: download them promptly
      console.log('Bot completed:', data.bot_id, data.mp4, data.transcription, data.duration_seconds, extra);
      break;
    case 'bot.chat_message':
      // Only participant messages are delivered, not the bot's own
      console.log('Chat message:', data.bot_id, data.sender_name, data.text, extra);
      break;
    case 'bot.failed':
      console.log('Bot failed:', data.bot_id, data.error_code, data.error_message, extra);
      break;
    case 'calendar.connection_created':
      console.log('Calendar connected:', data.calendar_id, data.platform, data.account_email);
      break;
    case 'calendar.connection_updated':
      console.log('Calendar connection updated:', data.calendar_id, data.status);
      break;
    case 'calendar.connection_deleted':
      console.log('Calendar connection deleted:', data.calendar_id);
      break;
    case 'calendar.connection_error':
      console.log('Calendar connection error:', data.calendar_id, data.error);
      break;
    case 'calendar.events_synced':
      console.log('Calendar events synced:', data.calendar_id, data.events_synced, data.sync_type);
      break;
    case 'calendar.event_created':
      console.log('Calendar event created:', data.calendar_id, data.series_id, data.instances?.length);
      break;
    case 'calendar.event_updated':
      console.log('Calendar event updated:', data.calendar_id, data.series_id, data.affected_instances?.length);
      break;
    case 'calendar.event_cancelled':
      console.log('Calendar event cancelled:', data.calendar_id, data.series_id, data.cancelled_instances?.length);
      break;
    default:
      // Return 200 for events you don't handle (the list may not be exhaustive), or Meeting BaaS retries them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
