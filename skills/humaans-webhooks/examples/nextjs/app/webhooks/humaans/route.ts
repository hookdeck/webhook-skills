// Generated with: humaans-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// Humaans events share one wrapper; `action` is the event type.
interface HumaansEvent {
  id: string;
  seq: string;
  ts: string;
  action: string;
  subject?: { id: string; type: string };
  actor?: { personId?: string; type: string };
  entity?: {
    id: string;
    fieldsChanged?: string[];
    next?: Record<string, unknown> | null;
    prev?: Record<string, unknown> | null;
    metadata?: { type?: string } & Record<string, unknown>;
  };
}

function handleEvent(event: HumaansEvent) {
  switch (event.action) {
    case 'person.created':
      console.log(`Person created: ${event.subject?.id}`);
      break;
    case 'person.updated':
      console.log(`Person updated: ${event.subject?.id} (changed: ${(event.entity?.fieldsChanged ?? []).join(', ')})`);
      break;
    case 'person.offboarded':
      console.log(`Person offboarded: ${event.subject?.id}`);
      break;
    case 'timeAway.created':
      console.log(`Time away requested: ${event.entity?.id}`);
      break;
    case 'timeAway.approved':
      console.log(`Time away approved: ${event.entity?.id}`);
      break;
    case 'compensation.updated':
      console.log(`Compensation updated: ${event.entity?.id} (${event.entity?.metadata?.type ?? 'unknown type'})`);
      break;
    default:
      console.log(`Unhandled Humaans event: ${event.action}`);
  }

  // TODO: sync the change to payroll, your directory, etc.
  // Deduplicate on the webhook-id header: retries reuse it.
}

// Humaans delivers via Svix, which may send webhook-* or svix-* headers
function header(request: NextRequest, name: string): string | null {
  return request.headers.get(`webhook-${name}`) ?? request.headers.get(`svix-${name}`);
}

export async function POST(request: NextRequest) {
  const secret = process.env.HUMAANS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HUMAANS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const webhookId = header(request, 'id');
  const webhookTimestamp = header(request, 'timestamp');
  const webhookSignature = header(request, 'signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // Read the raw body - verification must run on the exact bytes Humaans sent
  const rawBody = await request.text();

  let event: HumaansEvent;
  try {
    // Verifies HMAC-SHA256 over "{id}.{timestamp}.{raw body}", rejects timestamps
    // more than 5 minutes off, and returns the parsed payload. Behind Hookdeck,
    // retries and replays keep the original timestamp: for those, use the manual
    // verifier in references/verification.md and choose your own window.
    event = new Webhook(secret).verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    }) as HumaansEvent;
  } catch (err) {
    console.error('Humaans webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Humaans webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Any 2xx = delivered; other responses are retried with exponential backoff
  return NextResponse.json({ received: true });
}
