// Generated with: outhire-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Outhire signs deliveries with Standard Webhooks:
//   webhook-id         unique delivery ID
//   webhook-timestamp  Unix seconds when the request was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Hookdeck also accepts the svix-* spelling of the same three headers, so
// this handler falls back to svix-id / svix-timestamp / svix-signature when
// webhook-id is absent.
// ---------------------------------------------------------------------------

interface OuthireEvent {
  event: string; // candidate.applied | candidate.stage_changed | webhook.ping
  occurred_at: string; // ISO 8601
  candidate?: Record<string, any>;
  job?: Record<string, any>;
  company?: Record<string, any>;
  stage_change?: Record<string, any>;
  webhook?: Record<string, any>; // webhook.ping only
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers, preferring webhook-* and falling back to
 * svix-* when webhook-id is missing. Returns the values under the names the
 * standardwebhooks library expects, or null if any is missing.
 */
function signatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify an Outhire delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Hookdeck retries and replays resend the original timestamp, so this rejects
 * a retry that arrives more than 5 minutes late. See references/verification.md
 * for a manual verifier without that window.
 */
function verifyOuthireWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.OUTHIRE_WEBHOOK_SECRET as string
): OuthireEvent {
  return new Webhook(secret).verify(rawBody, headers) as OuthireEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The body has no event ID, so dedupe on the webhook-id header.
const processedDeliveryIds = new Set<string>();

function handleEvent(event: OuthireEvent): void {
  const { candidate = {}, job = {}, stage_change: stageChange = {} } = event;

  switch (event.event) {
    case 'candidate.applied':
      console.log(
        `Candidate ${candidate.id} (${candidate.name}) applied to job ${job.id} "${job.title}", fit score ${candidate.fit_score ?? 'pending'}`
      );
      break;
    case 'candidate.stage_changed':
      // changed_by is one of: user, joel, api
      console.log(
        `Candidate ${candidate.id} moved ${stageChange.previous_stage} -> ${stageChange.new_stage} (by ${stageChange.changed_by})`
      );
      break;
    case 'webhook.ping':
      // Sent by "Send test ping"; a signed delivery, not a challenge.
      console.log(`Test ping for webhook ${event.webhook?.id}`);
      break;
    default:
      console.log(`Unhandled Outhire event: ${event.event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.OUTHIRE_WEBHOOK_SECRET) {
    console.error('OUTHIRE_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: OuthireEvent;
  try {
    event = verifyOuthireWebhook(rawBody, headers);
  } catch (err) {
    console.error('Outhire webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Outhire does not resend a delivered event, but dedupe anyway.
  const deliveryId = headers['webhook-id'];
  if (processedDeliveryIds.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Outhire needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedDeliveryIds.add(deliveryId);
  } catch (err) {
    console.error('Error handling Outhire event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
