// Generated with: epilot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// epilot signs webhooks per Standard Webhooks:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds when the request was signed
//   webhook-signature  space-separated entries: "v1a,<Ed25519> v1,<HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the webhook's secret after its `whsec_` prefix.
// The v1a (Ed25519) entry is ignored here; the v1 entry proves the request
// was made for your webhook. Each webhook config has its own secret.
// ---------------------------------------------------------------------------

interface EpilotEvent {
  metadata?: {
    webhook_id?: string;
    organization_id?: string;
    event_type?: string;
    correlation_id?: string;
  };
  entity?: { _id?: string; _schema_?: string; [key: string]: unknown };
  event_attachments?: { filename?: string }[];
  _event_name?: string; // Event Catalog payloads (file events)
  _org_id?: string;
  [key: string]: unknown;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers. epilot sends webhook-*; when webhook-id is
 * absent, fall back to the svix-* names (as Hookdeck does). The result uses the
 * webhook-* names the standardwebhooks library expects.
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
 * Verify an epilot delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry. Other versions,
 * such as epilot's `v1a` Ed25519 entry, are skipped.
 */
function verifyEpilotWebhook(rawBody: string, headers: SignatureHeaders, secret: string): EpilotEvent {
  new Webhook(secret).verify(rawBody, headers, { jsonParse: false }); // throws on failure
  // A bodiless (e.g. GET) delivery is verified over zero bytes.
  return (rawBody ? JSON.parse(rawBody) : {}) as EpilotEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// webhook-id is stable across retries of the same message.
const processedMessageIds = new Set<string>();

// The event name is per organization. The default payload carries it in
// metadata.event_type; Event Catalog payloads (file events) use _event_name.
// metadata.webhook_id identifies the webhook config, i.e. one eventName.
function eventName(event: EpilotEvent): string | null {
  return event.metadata?.event_type || event._event_name || null;
}

function handleEvent(event: EpilotEvent): void {
  const name = eventName(event);
  const entity = event.entity || {};

  switch (name) {
    case 'automation_trigger_webhook':
      console.log(`Automation trigger: ${entity._schema_} ${entity._id} (webhook ${event.metadata?.webhook_id})`);
      break;
    case 'customer_request_created':
      console.log(`Customer request created: ${entity._schema_} ${entity._id}`);
      break;
    case 'FileCreated':
    case 'event_FileCreated': {
      // Event Catalog envelope; files are listed in event_attachments.
      const files = (event.event_attachments || []).map((f) => f.filename).join(', ');
      console.log(`File created in org ${event._org_id}: ${files}`);
      break;
    }
    default:
      console.log(`Unhandled epilot event: ${name} (webhook ${event.metadata?.webhook_id})`);
  }
}

async function handle(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.EPILOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EPILOT_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: EpilotEvent;
  try {
    event = verifyEpilotWebhook(rawBody, headers, secret);
  } catch (err) {
    console.error('epilot webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling epilot event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Each epilot webhook config sets its own httpMethod, so handle all of them.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
