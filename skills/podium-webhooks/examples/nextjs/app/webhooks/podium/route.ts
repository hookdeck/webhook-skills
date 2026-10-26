// Generated with: podium-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextResponse } from 'next/server';

// Podium signs every delivery (only when the webhook was created with a secret):
//   podium-signature  bare lowercase hex HMAC-SHA256 (64 chars, no prefix)
//   podium-timestamp  Unix MILLISECONDS when the payload was signed
// Signed content: `${podium-timestamp header}.${raw request body}`
// Key: the `secret` set when the webhook was created, as UTF-8 bytes, not decoded.

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

function verifyPodiumSignature(
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

/**
 * Opt-in replay window in seconds. Unset or 0 = off (Hookdeck retries keep the
 * original timestamp). podium-timestamp is Unix milliseconds.
 */
function withinTolerance(timestamp: string): boolean {
  const tolerance = Number(process.env.PODIUM_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!(tolerance > 0)) return true;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(Date.now() - ts) <= tolerance * 1000;
}

// Podium delivers { data, metadata: { event_type, version } }. Dispatch on
// metadata.event_type; the full list (26 events) is in the Podium docs.
function handleEvent(payload: Record<string, any>) {
  const eventType = payload.metadata?.event_type;
  const data = payload.data;

  switch (eventType) {
    case 'message.received':
      console.log('Message received', data);
      break;
    case 'message.sent':
      console.log('Message sent', data);
      break;
    case 'contact.created':
      console.log('Contact created', data);
      break;
    case 'contact.updated':
      console.log('Contact updated', data);
      break;
    case 'review.created':
      console.log('Review created', data);
      break;
    case 'invoice.payment_succeeded':
      console.log('Invoice payment succeeded', data);
      break;
    case 'call.completed':
      console.log('Call completed', data);
      break;
    default:
      console.log(`Unhandled Podium event: ${eventType}`);
  }
}

// Podium doesn't document the HTTP method, so every method is handled the same way.
async function handle(request: Request) {
  const secret = process.env.PODIUM_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('PODIUM_WEBHOOK_SECRET is not set - rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, never request.json(). A missing body (e.g. GET) is empty bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('podium-signature');
  const timestamp = request.headers.get('podium-timestamp');

  if (!verifyPodiumSignature(rawBody, signature, timestamp, secret)) {
    console.error('Podium signature verification failed');
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
  }

  try {
    // Keep this fast. In production, enqueue and process asynchronously, and
    // make handling idempotent (no delivery id header is documented; use the object ids in `data`).
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Podium event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
