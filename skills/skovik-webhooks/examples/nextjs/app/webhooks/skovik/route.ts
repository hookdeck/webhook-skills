// Generated with: skovik-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Skovik delivers webhooks with Standard Webhooks signatures:
//   webhook-id         delivery id, the same on every retry of a delivery
//   webhook-timestamp  Unix seconds when this attempt was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each webhook endpoint has its own signing secret.
// Hookdeck's Skovik source also accepts the svix-* header names when webhook-id
// is absent, so this handler does the same.
// ---------------------------------------------------------------------------

interface SkovikEvent {
  id: string; // delivery id, matches the webhook-id header
  type: string; // e.g. "export_orders.completed"
  timestamp: string;
  data: {
    id: string; // event id: dedupe key, same on every retry and every endpoint
    type: 'webhook_events';
    attributes: { created_at: string; name: string };
    links: { self: string };
    // Omitted for events with no related resource, such as misc.ping.
    relationships?: {
      related_object?: {
        data?: { type: string; id: string };
        links?: { related?: string };
      };
    };
  };
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
 * Verify a Skovik delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 */
function verifySkovikWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.SKOVIK_WEBHOOK_SECRET as string
): SkovikEvent {
  return new Webhook(secret).verify(rawBody, headers) as SkovikEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// data.id is the event id: the same on every retry and on every endpoint.
const processedEventIds = new Set<string>();

function handleEvent(event: SkovikEvent): void {
  // The delivery is a thin notification: the related resource is only linked.
  // Fetch its current state from the `related` URL instead of trusting a snapshot.
  const { type, data } = event;
  const related = data?.relationships?.related_object?.data;
  const resource = related ? `${related.type}/${related.id}` : 'no related resource';

  switch (type) {
    // --- Users -------------------------------------------------------------
    case 'users.created':
    case 'users.updated':
    case 'users.archived':
      console.log(`${type}: ${resource}`);
      break;

    // --- Export orders -----------------------------------------------------
    case 'export_orders.created':
      console.log(`Export order created: ${resource}`);
      break;
    case 'export_orders.completed':
      // Fetch the export order to get the URL of the export file.
      console.log(`Export order completed: ${resource}`);
      break;
    case 'export_orders.failed':
      // Fetch the export order and read its `error_message` attribute.
      console.log(`Export order failed: ${resource}`);
      break;

    // --- Branches ----------------------------------------------------------
    case 'branches.created':
    case 'branches.updated':
    case 'branches.archived':
      console.log(`${type}: ${resource}`);
      break;

    // --- Test event --------------------------------------------------------
    case 'misc.ping':
      // Sent from the settings UI to test an endpoint. It is signed like any
      // other delivery, is never retried, and has no related resource.
      console.log('Skovik ping received');
      break;

    default:
      // The documented list may not be exhaustive: acknowledge unknown types.
      console.log(`Unhandled Skovik event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SKOVIK_WEBHOOK_SECRET) {
    console.error('SKOVIK_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: SkovikEvent;
  try {
    event = verifySkovikWebhook(rawBody, headers);
  } catch (err) {
    console.error('Skovik webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const eventId = event.data?.id;
  if (eventId && processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Skovik times out after 5 seconds. In production, enqueue the event here
    // and process it asynchronously.
    handleEvent(event);
    if (eventId) processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Skovik event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
