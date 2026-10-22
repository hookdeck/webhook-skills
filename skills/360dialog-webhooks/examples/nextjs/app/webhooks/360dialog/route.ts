// Generated with: 360dialog-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  extractEvents,
  isConfigured,
  verify360dialogRequest,
  type ThreeSixtyDialogEvent,
} from '../../../lib/verify-360dialog';

function handleEvent(event: ThreeSixtyDialogEvent): void {
  switch (event.kind) {
    case 'message': {
      const m = event.message!;
      // m.type: text, image, video, audio, document, sticker, location, contacts, reaction,
      // interactive, button, order, system, unsupported, ...
      console.log(`Inbound ${m.type} message ${m.id} from ${m.from}`);
      // TODO: process the inbound message (acknowledge fast, do real work asynchronously)
      break;
    }

    case 'status': {
      const s = event.status!;
      // s.status: sent, delivered, read, failed, played
      console.log(`Message ${s.id} to ${s.recipient_id}: ${s.status}`);
      // TODO: update delivery state (log s.errors when status is failed)
      break;
    }

    case 'error':
      console.log(`Operational error ${event.error!.code}: ${event.error!.title}`);
      break;

    case 'smb_message_echoes':
      console.log(`Echoed ${(event.value.message_echoes ?? []).length} message(s) sent from the WhatsApp Business app`);
      // TODO: record messages the business sent from the app (Coexistence)
      break;

    case 'history':
      console.log('Chat history sync event');
      // TODO: store history chunks (Coexistence)
      break;

    case 'smb_app_state_sync':
      console.log(`Contact state sync: ${(event.value.state_sync ?? []).length} change(s)`);
      // TODO: sync contacts (Coexistence)
      break;

    default:
      console.log(`Unhandled 360dialog event: ${event.kind}`);
  }
}

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    console.error('Set THREE_SIXTY_DIALOG_WEBHOOK_USERNAME and THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  // Authenticate before reading or parsing the body.
  if (!verify360dialogRequest(request.headers)) {
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
    for (const event of extractEvents(payload as Record<string, any>)) handleEvent(event);
  } catch (err) {
    console.error('Error handling 360dialog webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // 360dialog needs a 200 within 5 seconds, otherwise it retries
  return NextResponse.json({ received: true });
}
