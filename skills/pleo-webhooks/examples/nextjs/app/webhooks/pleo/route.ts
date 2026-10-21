// Generated with: pleo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Pleo delivers webhooks through Svix, using Standard Webhooks headers:
//   webhook-id         unique message id (same value when a delivery is retried)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 signature>" (space-delimited list)
// Pleo's docs don't spell out the signed content. Svix (and Standard Webhooks)
// sign `${webhook-id}.${webhook-timestamp}.${rawBody}` with HMAC-SHA256, keyed
// with the base64-decoded part of the `whsec_` secret after the prefix.
//
// The secret comes from GET /v1/subscriptions/{id}/secret (data.secretKey).
// ---------------------------------------------------------------------------

export interface PleoEvent {
  data: Record<string, any>; // the resource as it was when the event fired
  eventId: string;
  eventType: string; // versioned, e.g. "v1.export-job.created"
}

type PleoHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Pleo delivery with the Standard Webhooks library (Pleo has no
 * webhook SDK of its own). It rejects timestamps more than 5 minutes off,
 * recomputes the HMAC over the raw body, and compares in constant time
 * against every `v1,` entry in the header. Throws if verification fails.
 */
function verifyPleoWebhook(rawBody: string, headers: PleoHeaders, secret: string): PleoEvent {
  return new Webhook(secret).verify(rawBody, headers) as PleoEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Pleo retries failed deliveries for about 27.5 hours with the same webhook-id.
const processedMessageIds = new Set<string>();

function handleEvent(event: PleoEvent): void {
  const { eventType, eventId, data } = event;

  switch (eventType) {
    case 'v1.export-job.created':
      // A user clicked Export in Pleo. Fetch the job's items and push them to
      // the accounting system, instead of polling GET /v2/export-jobs.
      console.log(
        `Export job ${data.id} created for company ${data.companyId} ` +
          `(${data.numberOfItems} items, status=${data.status}, event ${eventId})`
      );
      break;

    case 'v1.vendor.created':
      // A DRAFT vendor was added in Pleo. Create it in the accounting system,
      // then activate it in Pleo. The payload already holds the vendor details.
      console.log(`Vendor ${data.id} "${data.name}" created (state=${data.state}, event ${eventId})`);
      break;

    default:
      console.log(`Unhandled Pleo event type: ${eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.PLEO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PLEO_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: PleoEvent;
  try {
    event = verifyPleoWebhook(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      },
      secret
    );
  } catch (err) {
    console.error('Pleo webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the webhook-id, so acknowledge duplicates with 200.
  if (processedMessageIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Pleo event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
