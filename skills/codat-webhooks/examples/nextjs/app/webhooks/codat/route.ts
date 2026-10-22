// Generated with: codat-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Codat delivers webhooks through Svix using the Standard Webhooks header names:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// NOTE: these are webhook-*, not svix-*.
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface CodatEvent {
  eventType?: string; // e.g. "read.completed"
  type?: string;
  payload?: Record<string, any>;
  [key: string]: any;
}

type WebhookHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Codat delivery with the Standard Webhooks library. It checks the
 * timestamp (5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 */
function verifyCodatWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret = process.env.CODAT_WEBHOOK_SECRET as string
): CodatEvent {
  return new Webhook(secret).verify(rawBody, headers) as CodatEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on the webhook-id header, which is the same on every retry.
const processedMessageIds = new Set<string>();

function handleEvent(event: CodatEvent): void {
  const type = event.eventType || event.type;
  const payload = event.payload || {};

  switch (type) {
    case 'company.created':
      console.log(`Company created: ${payload.referenceCompany?.id ?? payload.companyId ?? 'unknown'}`);
      break;
    case 'connection.created':
    case 'connection.connected':
      console.log(`${type}: ${payload.connection?.id ?? payload.connectionId ?? 'unknown'}`);
      break;
    case 'read.completed':
      console.log(`Read completed${payload.dataType ? ` for ${payload.dataType}` : ''}`);
      break;
    case 'write.successful':
      console.log('Write successful');
      break;
    default:
      console.log(`Unhandled Codat event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CODAT_WEBHOOK_SECRET) {
    console.error('CODAT_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: CodatEvent;
  try {
    event = verifyCodatWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Codat webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Codat event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
