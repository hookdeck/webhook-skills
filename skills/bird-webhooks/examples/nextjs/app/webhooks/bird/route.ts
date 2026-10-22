// Generated with: bird-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Bird (bird.com, formerly MessageBird) follows the Standard Webhooks spec:
//   webhook-id         identifies the delivery (stable across retries/replays)
//   webhook-timestamp  Unix seconds of this delivery attempt
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list during
//                      the 24h secret-rotation overlap)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Not covered: the legacy MessageBird API (MessageBird-Signature /
// MessageBird-Signature-JWT headers) uses a different scheme.
// ---------------------------------------------------------------------------

interface BirdEvent {
  type: string; // e.g. "email.delivered"
  timestamp: string; // when the event occurred; use it for ordering
  data: Record<string, any>;
}

type BirdHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Bird delivery with the Standard Webhooks library. It rejects
 * timestamps more than 5 minutes off, recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 */
function verifyBirdWebhook(
  rawBody: string,
  headers: BirdHeaders,
  secret = process.env.BIRD_WEBHOOK_SECRET as string
): BirdEvent {
  return new Webhook(secret).verify(rawBody, headers) as BirdEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Bird delivers at-least-once; every retry and replay reuses the webhook-id.
const processedDeliveryIds = new Set<string>();

function handleEvent(event: BirdEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    case 'email.delivered':
      console.log(`Email delivered: ${data.email_id} to ${data.recipient}`);
      break;
    case 'email.bounced':
      console.log(
        `Email bounced: ${data.email_id} to ${data.recipient} (${data.bounce_type}, code ${data.bounce_code})`
      );
      break;
    case 'email.complained':
      console.log(`Email complaint: ${data.email_id} from ${data.recipient}`);
      break;
    case 'whatsapp.received':
      console.log(`WhatsApp message received: ${data.whatsapp_id} from ${data.from?.phone_number}`);
      break;
    case 'preference.granted':
    case 'preference.revoked':
      console.log(`${type}: ${data.channel} ${data.handle} (${data.coverage})`);
      break;

    default:
      // Bird adds event types as products ship. Ignore ones you don't handle.
      console.log(`Unhandled Bird event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BIRD_WEBHOOK_SECRET) {
    console.error('BIRD_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC. text()
  // reads the body whatever the Content-Type is.
  const rawBody = await request.text();

  let event: BirdEvent;
  try {
    event = verifyBirdWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    // 400 is deliberate: Bird retries, so a missing/rotating secret can be
    // fixed before the retry window closes.
    console.error('Bird webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedDeliveryIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Bird waits 15 seconds for a 2xx. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(id);
  } catch (err) {
    console.error('Error handling Bird event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
