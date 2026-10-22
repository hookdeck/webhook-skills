// Generated with: granola-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// Granola payloads carry no note content. note.edited adds data.changed_fields.
interface GranolaEvent {
  event_id: string;
  event_type: 'note.generated' | 'note.edited' | 'note.access_granted' | string;
  note_id: string;
  occurred_at: string;
  data?: { changed_fields?: string[] };
}

function handleEvent(event: GranolaEvent) {
  switch (event.event_type) {
    case 'note.generated':
      console.log(`Note generated: ${event.note_id}`);
      break;
    case 'note.edited':
      console.log(`Note edited: ${event.note_id} (changed: ${(event.data?.changed_fields ?? []).join(', ')})`);
      break;
    case 'note.access_granted':
      console.log(`Note shared with you: ${event.note_id}`);
      break;
    default:
      console.log(`Unhandled Granola event: ${event.event_type}`);
  }

  // TODO: GET https://public-api.granola.ai/v1/notes/{note_id} with your API key,
  // then sync the summary to your CRM, wiki, etc.
  // Deduplicate on event_id: retries reuse it.
}

export async function POST(request: NextRequest) {
  const secret = process.env.GRANOLA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GRANOLA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // Read the raw body - verification must run on the exact bytes Granola sent
  const rawBody = await request.text();

  let event: GranolaEvent;
  try {
    // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
    // rejects timestamps more than 5 minutes off, and returns the parsed payload.
    event = new Webhook(secret).verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }) as GranolaEvent;
  } catch (err) {
    console.error('Granola webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Granola webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Respond within 15 seconds; 2xx = delivered
  return NextResponse.json({ received: true });
}
