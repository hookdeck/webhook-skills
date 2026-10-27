// Generated with: bugsmash-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// BugSmash signs every delivery:
//   X-BugSmash-Signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   X-Webhook-Timestamp   Unix seconds when the payload was signed
// Signed content: `${X-Webhook-Timestamp}.${raw request body}`
// Key: the secret_key as UTF-8 bytes, whole (including "bgsmsh_"), not decoded.

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

function verifyBugsmashSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!secret || !signature || !timestamp) return false;
  // Validate length and alphabet BEFORE decoding: Buffer.from(x, 'hex')
  // silently drops bad characters.
  if (!HEX_DIGEST.test(signature)) return false;

  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signed)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex')); // both 32 bytes
}

/** Opt-in replay window. Unset or 0 = off (Hookdeck retries keep the original timestamp). */
function withinTolerance(timestamp: string): boolean {
  const tolerance = Number(process.env.BUGSMASH_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!(tolerance > 0)) return true;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - ts) <= tolerance;
}

// BugSmash's docs list these events but document no delivery body, so the field
// carrying the event name is unknown. This reads `event`, then `type`, from an
// ILLUSTRATIVE payload ({ "event": "new_comment", "data": {...} }). Check a real
// delivery (POST /webhook/test) and adjust.
function handleEvent(payload: Record<string, any>) {
  const eventType = payload.event ?? payload.type;

  switch (eventType) {
    case 'new_comment':
      console.log('New comment', payload.data ?? payload);
      break;
    case 'comment_replied':
      console.log('Comment replied', payload.data ?? payload);
      break;
    case 'status_changed':
      console.log('Status changed', payload.data ?? payload);
      break;
    case 'comment_updated':
      console.log('Comment updated', payload.data ?? payload);
      break;
    default:
      console.log(`Unhandled BugSmash event: ${eventType}`);
  }
}

// BugSmash doesn't document the HTTP method, so every method is handled the same way.
async function handle(request: Request) {
  const secret = process.env.BUGSMASH_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('BUGSMASH_WEBHOOK_SECRET is not set - rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, never request.json(). A missing body (e.g. GET) is empty bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-bugsmash-signature');
  const timestamp = request.headers.get('x-webhook-timestamp');

  if (!verifyBugsmashSignature(rawBody, signature, timestamp, secret)) {
    console.error('BugSmash signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  if (!withinTolerance(timestamp as string)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after the signature is verified.
  let payload: Record<string, any> = {};
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (payload === null || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
  }

  try {
    // Keep this fast. In production, enqueue and process asynchronously, and
    // make handling idempotent (no delivery id header is documented).
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling BugSmash event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
