// Generated with: general-translation-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// General Translation signs webhooks with Standard Webhooks:
//   webhook-id         event ID (evt_...), stable across retries
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface GeneralTranslationEvent {
  id: string; // evt_..., equals the webhook-id header
  object: 'event';
  type: string; // e.g. "translated_file.completed"
  createdAt: string;
  apiVersion: string;
  // data.object.object is the resource kind (translated_file or translation_job)
  data: { object: Record<string, any> };
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the signature headers. General Translation sends webhook-*; when
 * webhook-id is absent, fall back to the svix-* names (as Hookdeck does).
 * Returns the three values under the names the library expects.
 */
function resolveSignatureHeaders(request: Request): SignatureHeaders | null {
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a delivery with the Standard Webhooks library. It enforces a fixed
 * 5-minute timestamp window, recomputes the HMAC over the raw body and
 * compares in constant time against every `v1,` entry (other versions are
 * ignored). Hookdeck retries and replays resend the ORIGINAL timestamp, so
 * late retries fail here; see references/verification.md for a manual
 * verifier with a configurable window.
 */
function verifyGeneralTranslationWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret: string
): GeneralTranslationEvent {
  return new Webhook(secret).verify(rawBody, headers) as GeneralTranslationEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// event.id (evt_...) equals the webhook-id header and is stable across retries.
const processedEventIds = new Set<string>();

function handleEvent(event: GeneralTranslationEvent): void {
  const resource = event.data?.object ?? {};

  switch (event.type) {
    case 'translated_file.completed':
      console.log(`Translated file ${resource.id} ready (${resource.locale}, ${resource.fileFormat})`);
      break;
    case 'translated_file.edited':
      console.log(`Translated file ${resource.id} edited at ${resource.editedAt}`);
      break;
    case 'translation_job.completed':
      console.log(`Translation job ${resource.jobId} completed at ${resource.completedAt}`);
      break;
    default:
      console.log(`Unhandled General Translation event type: ${event.type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GENERAL_TRANSLATION_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = resolveSignatureHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: GeneralTranslationEvent;
  try {
    event = verifyGeneralTranslationWebhook(rawBody, headers, secret);
  } catch (err) {
    console.error('General Translation webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Deliveries are at-least-once; acknowledge duplicates with 200.
  if (processedEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Respond with a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling General Translation event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
