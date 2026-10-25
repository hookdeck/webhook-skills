// Generated with: 8x8-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verify8x8Request } from '../../../lib/verify-8x8';

type EightXEightEvent = {
  eventType?: string;
  payload?: Record<string, any>;
  eventDetails?: Record<string, any>;
  [key: string]: unknown;
};

function handleEvent(event: EightXEightEvent): void {
  const p = event.payload ?? {};

  switch (event.eventType) {
    case 'inbound_message_received':
      console.log(`Inbound message ${p.umid} from ${p.source ?? p.user?.msisdn}`);
      // TODO: route the reply to your conversation or support system
      break;

    case 'outbound_message_status_changed':
      console.log(`Message ${p.umid}: ${p.status?.state}`);
      // TODO: update delivery status (queued, sent, delivered, undelivered, rejected, read)
      break;

    case 'external_app_message':
      console.log(`WhatsApp Business App message ${p.umid}`);
      break;

    case 'short_url_clicked':
      console.log(`Short URL clicked: ${p.shortUrl} -> ${p.targetUrl}`);
      // TODO: record the click against the original SMS (p.umid)
      break;

    case 'template_status_update':
      console.log(`Template ${event.eventDetails?.templateName} status update`);
      // TODO: sync template approval status
      break;

    case 'template_category_update':
    case 'template_quality_update':
    case 'template_correct_category_detection':
    case 'phone_number_quality_update':
    case 'account_update':
    case 'whatsapp_automatic_events':
      console.log(`WhatsApp business update: ${event.eventType}`);
      break;

    default:
      console.log(`Unhandled 8x8 event: ${event.eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verify8x8Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let event: unknown;
  try {
    // Read the raw text so any content type works.
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(event as EightXEightEvent);
  } catch (err) {
    console.error('Error handling 8x8 webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
