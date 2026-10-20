// Generated with: attio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { verifyAttioSignature } from '../../../lib/verify-attio-signature';

type AttioEvent = {
  event_type: string;
  id: Record<string, string>;
  actor?: { type: string | null; id: string | null } | null;
  [key: string]: unknown;
};

type AttioWebhookPayload = {
  webhook_id: string;
  events: AttioEvent[];
};

// Idempotency-Key values already processed. In-memory for the example only:
// use a durable store (DB unique constraint, Redis SET NX) in production.
const processedKeys = new Set<string>();

/**
 * Handle a single Attio event. Payloads contain IDs only; fetch full data
 * from the Attio REST API if you need it.
 */
function handleEvent(event: AttioEvent) {
  const id = event.id ?? {};

  switch (event.event_type) {
    case 'record.created':
      console.log(`Record created: ${id.record_id} (object ${id.object_id})`);
      // TODO: Sync the new record to your system
      break;

    case 'record.updated':
      console.log(`Record updated: ${id.record_id} (attribute ${id.attribute_id})`);
      // TODO: Fetch the record and sync the changed attribute
      break;

    case 'record.deleted':
      console.log(`Record deleted: ${id.record_id}`);
      // TODO: Remove the record downstream
      break;

    case 'record.merged':
      console.log(`Record ${event.duplicate_record_id} merged into ${id.record_id}`);
      // TODO: Re-point references to the merged record
      break;

    case 'list-entry.created':
      console.log(`List entry created: ${id.entry_id} in list ${id.list_id}`);
      // TODO: Start pipeline automation
      break;

    case 'list-entry.updated':
      console.log(`List entry updated: ${id.entry_id} (attribute ${id.attribute_id})`);
      // TODO: React to stage/status changes
      break;

    case 'list-entry.deleted':
      console.log(`List entry deleted: ${id.entry_id} from list ${id.list_id}`);
      // TODO: Clean up pipeline state
      break;

    case 'note.created':
      console.log(`Note created: ${id.note_id} on record ${event.parent_record_id}`);
      // TODO: Mirror the note
      break;

    case 'task.created':
      console.log(`Task created: ${id.task_id}`);
      // TODO: Create a ticket or reminder
      break;

    case 'comment.created':
      console.log(`Comment created: ${id.comment_id} in thread ${event.thread_id}`);
      // TODO: Notify a channel
      break;

    default:
      console.log(`Unhandled Attio event: ${event.event_type}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.ATTIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ATTIO_WEBHOOK_SECRET is not set');
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Attio sends the same value in both headers; X-Attio-Signature is for legacy middleware
  const signature =
    request.headers.get('attio-signature') ?? request.headers.get('x-attio-signature');
  if (!signature) {
    return Response.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // Read the raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifyAttioSignature(rawBody, signature, secret)) {
    console.error('Attio webhook signature verification failed');
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: AttioWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object') {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Idempotency-Key is stable across retries and redeliveries
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey && processedKeys.has(idempotencyKey)) {
    console.log(`Duplicate delivery ${idempotencyKey}, skipping`);
    return Response.json({ received: true, duplicate: true });
  }

  // Each delivery currently holds one event, but Attio may batch in future
  const events = Array.isArray(payload.events) ? payload.events : [];
  console.log(`Received ${events.length} event(s) from webhook ${payload.webhook_id}`);

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling Attio webhook:', err);
    // Non-2xx makes Attio retry (up to 10 times over ~3 days)
    return Response.json({ error: 'Handler error' }, { status: 500 });
  }

  if (idempotencyKey) {
    processedKeys.add(idempotencyKey);
  }

  // Respond within 5 seconds with any 2xx
  return Response.json({ received: true });
}
