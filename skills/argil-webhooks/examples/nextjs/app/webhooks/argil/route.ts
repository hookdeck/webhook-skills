// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Argil signs webhooks per Standard Webhooks:
//   webhook-id         unique message ID (stable across retries)
//   webhook-timestamp  Unix seconds
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// Webhooks created before Argil added signing are unsigned: recreate them.
// ---------------------------------------------------------------------------

interface ArgilEvent {
  event: string; // e.g. "VIDEO_GENERATION_SUCCESS"
  data: Record<string, any>;
}

type StandardHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify an Argil delivery with the Standard Webhooks library. It recomputes
 * the HMAC over the raw body, compares in constant time against every `v1,`
 * entry and enforces a fixed 5-minute timestamp window. Hookdeck retries and
 * replays resend the original timestamp, so late ones fail here: see the
 * manual verifier in references/verification.md to drop or widen the window.
 */
function verifyArgilWebhook(
  rawBody: string,
  headers: StandardHeaders,
  secret = process.env.ARGIL_WEBHOOK_SECRET as string
): ArgilEvent {
  return new Webhook(secret).verify(rawBody, headers) as ArgilEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Delivery is at-least-once and the body has no event ID: dedupe on webhook-id.
const processedMessageIds = new Set<string>();

function handleEvent(payload: ArgilEvent): void {
  const { event, data = {} } = payload;

  switch (event) {
    case 'VIDEO_GENERATION_SUCCESS':
      console.log(`Video ready: ${data.videoId} (${data.videoName}) ${data.videoUrl}, cost ${data.renderCost}`);
      break;
    case 'VIDEO_GENERATION_FAILED':
      console.log(`Video failed: ${data.videoId} (${data.message}), refunded ${data.renderCostRefunded}`);
      break;
    case 'AVATAR_TRAINING_SUCCESS':
      console.log(`Avatar trained: ${data.avatarId} (${data.avatarName})`);
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

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    // Webhooks created before Argil added signing arrive without these headers.
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature' },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let payload: ArgilEvent;
  try {
    payload = verifyArgilWebhook(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Argil webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same webhook-id; acknowledge duplicates with 200.
  if (processedMessageIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Argil needs a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(id);
  } catch (err) {
    console.error('Error handling Argil event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
