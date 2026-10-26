// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Argil signs webhooks per Standard Webhooks:
//   webhook-id         event ID (stable across retries)
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix, returned once
// by POST /webhooks. The body is `{ event, data }` with SCREAMING_SNAKE events.
// ---------------------------------------------------------------------------

interface ArgilEvent {
  event: string; // VIDEO_GENERATION_SUCCESS, AVATAR_TRAINING_FAILED, ...
  data: Record<string, any>;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Read the three signature headers. `webhook-*` is the documented prefix; if
 * `webhook-id` is absent, fall back to `svix-*` (same scheme, other prefix).
 * Returns the values under the names the standardwebhooks library expects.
 */
function signatureHeaders(request: Request): SignatureHeaders | null {
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify an Argil delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * Retries and replays (for example from Hookdeck) keep the original timestamp,
 * so this rejects them after 5 minutes. See references/verification.md for a
 * manual verifier without the window.
 */
function verifyArgilWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.ARGIL_WEBHOOK_SECRET as string
): ArgilEvent {
  return new Webhook(secret).verify(rawBody, headers) as ArgilEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Deliveries are at least once; webhook-id is the same on every retry.
const processedEventIds = new Set<string>();

function handleEvent(payload: ArgilEvent): void {
  const { event, data = {} } = payload;

  switch (event) {
    case 'VIDEO_GENERATION_SUCCESS':
      console.log(`Video ready: ${data.videoId} (${data.videoName}) ${data.videoUrl} cost ${data.renderCost}`);
      break;
    case 'VIDEO_GENERATION_FAILED':
      console.log(
        `Video failed: ${data.videoId}: ${data.message} (cost ${data.renderCost}, refunded ${data.renderCostRefunded})`
      );
      break;
    case 'AVATAR_TRAINING_SUCCESS':
      console.log(`Avatar trained: ${data.avatarId} (${data.avatarName}) voice ${data.voiceId}`);
      break;
    case 'AVATAR_TRAINING_FAILED':
      console.log(`Avatar training failed: ${data.avatarId} (${data.avatarName})`);
      break;
    default:
      console.log(`Unhandled Argil event: ${event}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ARGIL_WEBHOOK_SECRET) {
    console.error('ARGIL_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request);
  if (!headers) {
    return NextResponse.json(
      {
        error:
          'Missing Standard Webhooks signature headers. Webhooks created before Argil added signing are unsigned: recreate the webhook to get a whsec_ secret.',
      },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let payload: ArgilEvent;
  try {
    payload = verifyArgilWebhook(rawBody, headers);
  } catch (err) {
    console.error('Argil webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Argil needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(payload);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Argil event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
