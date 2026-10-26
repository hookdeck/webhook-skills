// Generated with: folk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// folk (CRM) webhooks follow the Standard Webhooks spec:
//   webhook-id         unique event ID (same as the payload's `id`)
//   webhook-timestamp  Unix seconds of the delivery
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// The secret is shown only once, when the webhook is created.
// ---------------------------------------------------------------------------

interface FolkEvent {
  id: string; // evt_..., same as the webhook-id header
  type: string; // e.g. "person.created"
  createdAt: string; // ISO 8601
  source: string; // API URL of the webhook that delivered the event
  data: {
    id: string; // resource ID (per_..., com_..., obj_..., nte_..., rmd_..., enr_...)
    url: string; // API URL to fetch the full resource
    changes?: Array<{ path: string[]; type: 'add' | 'remove' | 'set'; value?: unknown }>;
    details?: Record<string, any>; // deletions only
  };
}

/**
 * Verify a folk delivery with the official Standard Webhooks library. It checks
 * the timestamp (fixed 5-minute window), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * Replays and Hookdeck retries resend the ORIGINAL timestamp, so this rejects
 * them after 5 minutes. See references/verification.md for a manual verifier
 * where the window can be dropped or widened.
 */
function verifyFolkWebhook(
  rawBody: string,
  headers: Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>,
  secret = process.env.FOLK_WEBHOOK_SECRET as string
): FolkEvent {
  return new Webhook(secret).verify(rawBody, headers) as FolkEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// folk can deliver an event more than once; webhook-id (= event.id) is stable.
const processedEventIds = new Set<string>();

// Payloads are thin: data.id and data.url identify the resource (GET data.url
// for the full record). Updates carry data.changes, deletions carry data.details.
function handleEvent(event: FolkEvent): void {
  const { type, data } = event;

  switch (type) {
    // --- People ------------------------------------------------------------
    case 'person.created':
      console.log(`Person created: ${data.id}`);
      break;
    case 'person.updated':
      console.log(`Person updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'person.deleted':
      console.log(`Person deleted: ${data.id} (${data.details?.name})`);
      break;
    case 'person.groups_updated':
      console.log(`Person groups updated: ${data.id}`);
      break;
    case 'person.workspace_interaction_metadata_updated':
      console.log(`Person interaction metadata updated: ${data.id}`);
      break;

    // --- Companies ---------------------------------------------------------
    case 'company.created':
      console.log(`Company created: ${data.id}`);
      break;
    case 'company.updated':
      console.log(`Company updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'company.deleted':
      console.log(`Company deleted: ${data.id} (${data.details?.name})`);
      break;
    case 'company.groups_updated':
      console.log(`Company groups updated: ${data.id}`);
      break;

    // --- Custom objects (e.g. deals) ---------------------------------------
    case 'object.created':
      console.log(`Object created: ${data.id}`);
      break;
    case 'object.updated':
      console.log(`Object updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'object.deleted':
      console.log(`Object deleted: ${data.id} (${data.details?.name})`);
      break;

    // --- Notes -------------------------------------------------------------
    case 'note.created':
    case 'note.updated':
    case 'note.deleted':
      console.log(`${type}: ${data.id}`);
      break;

    // --- Reminders ---------------------------------------------------------
    case 'reminder.created':
    case 'reminder.updated':
    case 'reminder.deleted':
    case 'reminder.triggered':
      console.log(`${type}: ${data.id}`);
      break;

    // --- Person enrichments ------------------------------------------------
    case 'person_enrichment.finished':
      console.log(`Enrichment ${data.id} finished`);
      break;

    default:
      console.log(`Unhandled folk event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.FOLK_WEBHOOK_SECRET) {
    console.error('FOLK_WEBHOOK_SECRET is not set; rejecting delivery');
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

  let event: FolkEvent;
  try {
    event = verifyFolkWebhook(rawBody, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    });
  } catch (err) {
    console.error('folk webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Redeliveries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedEventIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Return a 2xx quickly. In production, enqueue the event here and process
    // it asynchronously (a 410 would deactivate the webhook, so never send one).
    handleEvent(event);
    processedEventIds.add(webhookId);
  } catch (err) {
    console.error('Error handling folk event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
