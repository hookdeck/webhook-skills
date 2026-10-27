// Generated with: salad-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// SaladCloud signs Job Queue webhooks with Standard Webhooks:
//   webhook-id         unique delivery identifier
//   webhook-timestamp  Unix seconds when the webhook was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret. SaladCloud shows the secret as bare base64
// with no `whsec_` prefix; the library accepts it as is, and also accepts the
// `whsec_`-prefixed form that Hookdeck needs.
// Hookdeck's SaladCloud source also accepts the svix-* header names when
// webhook-id is absent, so this handler does the same.
// ---------------------------------------------------------------------------

interface SaladJobEvent {
  type: string; // e.g. "queue.job.succeeded"
  timestamp: string;
  data: Record<string, any>; // the job document
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a SaladCloud delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifySaladWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SALAD_CLOUD_WEBHOOK_SECRET as string
): SaladJobEvent {
  return new Webhook(secret).verify(rawBody, headers) as SaladJobEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body has no event id, so key on the delivery's webhook-id.
const processedDeliveryIds = new Set<string>();

function handleEvent(event: SaladJobEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    case 'queue.job.succeeded':
      // data is the job document. data.events[].type are lifecycle steps
      // (created, started, succeeded), not the webhook event.
      console.log(
        `Job ${data.id} ${data.status} in queue ${data.queue_name} ` +
          `(project ${data.project_name}, org ${data.organization_name})`
      );
      break;

    default:
      // Only queue.job.succeeded is documented; failed/cancelled jobs are not covered.
      console.log(`Unhandled SaladCloud event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SALAD_CLOUD_WEBHOOK_SECRET) {
    console.error('SALAD_CLOUD_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SaladJobEvent;
  try {
    event = verifySaladWebhook(rawBody, headers);
  } catch (err) {
    console.error('SaladCloud webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Acknowledge repeats of the same delivery with 200.
  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling SaladCloud event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
