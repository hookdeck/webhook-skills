// Generated with: sajn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// sajn (sajn.se) signs webhooks with Standard Webhooks (API version 2026-10+):
//   webhook-id         the event ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Endpoints on the deprecated 2026-09 API version send X-Sajn-Signature instead.
// ---------------------------------------------------------------------------

interface SajnEvent {
  id: string;
  type: string; // e.g. "document.completed"
  createdAt: string;
  apiVersion: string;
  workspaceId: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  actor: { type: string; id: string } | null;
  data: Record<string, any>; // data.object is the resource
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

const API_VERSION_HINT =
  'Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the ' +
  'deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks ' +
  'and fail verification.';

/**
 * Read the signature headers. Standard Webhooks uses webhook-*; when
 * webhook-id is absent, fall back to the svix-* names, as Hookdeck does.
 * Returns them under the webhook-* names the library expects.
 */
function readSignatureHeaders(get: (name: string) => string | null): Partial<SignatureHeaders> {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`) ?? undefined,
    'webhook-timestamp': get(`${prefix}-timestamp`) ?? undefined,
    'webhook-signature': get(`${prefix}-signature`) ?? undefined,
  };
}

/**
 * Verify a sajn delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 */
function verifySajnWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SAJN_WEBHOOK_SECRET as string
): SajnEvent {
  return new Webhook(secret).verify(rawBody, headers) as SajnEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The event id is the same on every retry, replay and endpoint.
const processedEventIds = new Set<string>();

function handleEvent(event: SajnEvent): void {
  const { type, data = {} } = event;
  const object = data.object || {};

  switch (type) {
    // --- Documents ---------------------------------------------------------
    case 'document.sent':
      console.log(`Document sent: ${object.id} (${object.name})`);
      break;
    case 'document.fully_signed':
      // Every party has signed, but the PDF is not sealed yet.
      console.log(`Document fully signed: ${object.id}`);
      break;
    case 'document.completed':
      // The sealed PDF is ready: download the signed file here.
      console.log(`Document completed: ${object.id} (${object.name})`);
      break;
    case 'document.rejected':
    case 'document.expired':
    case 'document.withdrawn':
      console.log(`${type}: ${object.id}`);
      break;
    case 'document.expiring_soon':
      console.log(`Document expiring soon: ${object.id} (expires ${object.expiresAt})`);
      break;

    // --- Parties -----------------------------------------------------------
    case 'document.party.signed':
      console.log(`Party ${data.party?.id} signed document ${object.id}`);
      break;
    case 'document.party.rejected':
      console.log(`Party ${data.party?.id} rejected document ${object.id}`);
      break;
    case 'document.party.delivery_failed':
      // The invitation email bounced or the SMS failed.
      console.log(`Invitation to party ${data.party?.id} failed on document ${object.id}`);
      break;

    // --- Approvals ---------------------------------------------------------
    case 'approval_request.created':
    case 'approval_request.approved':
    case 'approval_request.rejected':
    case 'approval_request.cancelled':
      console.log(`${type}: ${object.id}`);
      break;

    // --- Identity checks ---------------------------------------------------
    case 'identity_check.verified':
      console.log(`Identity check verified: ${object.id}`);
      break;
    case 'identity_check.failed':
      console.log(`Identity check failed: ${object.id} (${data.failureReason})`);
      break;

    // --- Forms, usage, test ------------------------------------------------
    case 'form.submitted':
      console.log(`Form submission: ${object.id}`);
      break;
    case 'usage.limit_reached':
      console.log('sajn usage limit reached');
      break;
    case 'webhook.test':
      console.log(`Test event received for webhook ${object.id}`);
      break;

    default:
      // sajn adds event types without a new API version: acknowledge, don't fail.
      console.log(`Unhandled sajn event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SAJN_WEBHOOK_SECRET) {
    console.error('SAJN_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = readSignatureHeaders((name) => request.headers.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    // This also answers the unsigned {"test": true} POST the dashboard sends when you save a webhook.
    const legacy = request.headers.get('x-sajn-signature') ? ` ${API_VERSION_HINT}` : '';
    return NextResponse.json(
      { error: `Missing Standard Webhooks signature headers.${legacy}` },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SajnEvent;
  try {
    event = verifySajnWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('sajn webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same event id; acknowledge duplicates with 200.
  const eventId = event.id || (headers['webhook-id'] as string);
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // sajn needs a 2xx within 30 seconds. In production, enqueue the event
    // here and process it asynchronously. Deliveries are unordered: compare
    // event.createdAt before overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling sajn event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
