// Generated with: pipeline-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Pipeline CRM signs deliveries with Standard Webhooks (opt-in per endpoint:
// Request signing > Enable signing on the automation's Call an API action):
//   webhook-id         unique delivery ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface PipelineCrmEvent {
  trigger?: string;
  timestamp?: string;
  event_model: string; // deal | person | company
  event_action: string; // create | update | destroy
  event_model_id?: number;
  event_data?: Record<string, any>;
  event_changes?: Record<string, [unknown, unknown]>; // updates only
  caused_by_user?: Record<string, any>;
}

type WebhookHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Pipeline CRM delivery with the Standard Webhooks library. It checks
 * the timestamp (fixed 5-minute window), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the ORIGINAL webhook-timestamp, so this
 * library rejects them after 5 minutes. See references/verification.md for a
 * manual verifier where the window can be dropped or widened.
 */
function verifyPipelineCrmWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret = process.env.PIPELINE_CRM_WEBHOOK_SECRET as string
): PipelineCrmEvent {
  return new Webhook(secret).verify(rawBody, headers) as PipelineCrmEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The payload carries no event ID, so dedupe on the webhook-id header.
const processedDeliveryIds = new Set<string>();

function handleEvent(event: PipelineCrmEvent): void {
  // The body has no event type string; combine event_model and event_action.
  const eventType = `${event.event_model}.${event.event_action}`;
  const data = event.event_data ?? {};

  switch (eventType) {
    case 'deal.create':
      console.log(`Deal created: ${event.event_model_id} (${data.name})`);
      break;
    case 'deal.update':
      // event_changes maps each changed field to [old, new]
      console.log(`Deal updated: ${event.event_model_id} changes: ${Object.keys(event.event_changes ?? {}).join(', ')}`);
      break;
    case 'deal.destroy':
      console.log(`Deal deleted: ${event.event_model_id}`);
      break;
    case 'person.create':
      console.log(`Person created: ${event.event_model_id}`);
      break;
    case 'person.update':
      console.log(`Person updated: ${event.event_model_id}`);
      break;
    case 'person.destroy':
      console.log(`Person deleted: ${event.event_model_id}`);
      break;
    case 'company.create':
      console.log(`Company created: ${event.event_model_id}`);
      break;
    case 'company.update':
      console.log(`Company updated: ${event.event_model_id}`);
      break;
    case 'company.destroy':
      console.log(`Company deleted: ${event.event_model_id}`);
      break;
    default:
      console.log(`Unhandled Pipeline CRM event: ${eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.PIPELINE_CRM_WEBHOOK_SECRET) {
    console.error('PIPELINE_CRM_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  // Signing is opt-in; unsigned deliveries have no webhook-* headers.
  if (!id || !timestamp || !signature) {
    return NextResponse.json(
      { error: 'Missing webhook signature headers (is signing enabled?)' },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: PipelineCrmEvent;
  try {
    event = verifyPipelineCrmWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Pipeline CRM webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedDeliveryIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Pipeline CRM expects a 2xx within a few seconds. In production, enqueue
    // the event here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(id);
  } catch (err) {
    console.error('Error handling Pipeline CRM event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
