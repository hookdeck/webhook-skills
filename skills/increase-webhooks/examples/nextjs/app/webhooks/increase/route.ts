// Generated with: increase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Increase uses the Standard Webhooks headers and signed content, but NOT the Standard Webhooks
// key format: the Event Subscription's shared_secret is the HMAC key as raw UTF-8 bytes
// (no whsec_ prefix, no base64 decoding), so the standardwebhooks library can't be used as-is.
//   webhook-id:        the Event ID
//   webhook-timestamp: unix seconds
//   webhook-signature: "v1,<base64 HMAC-SHA256 of '<id>.<timestamp>.<raw body>'>", space-separated
//                      when more than one secret is active
// https://increase.com/documentation/webhooks#securing-your-webhook-endpoint-recommended

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set INCREASE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.INCREASE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`INCREASE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyIncrease(rawBody: string, headers: Headers, secret: string): boolean {
  if (!secret) return false;

  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  // Increase suggests a 5-minute window. It's opt-in here: off unless
  // INCREASE_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  // The secret is used as-is: raw UTF-8 bytes, not base64-decoded
  const expected = 'v1,' + crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  return signatureHeader.split(' ').some((sig) => safeEqual(sig, expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.INCREASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('INCREASE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the content type is
  const rawBody = await request.text();

  if (!verifyIncrease(rawBody, request.headers, secret)) {
    console.error('Increase webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Events are thin: {id, category, associated_object_type, associated_object_id, created_at, type}.
  // Dispatch on category and GET the object from the API if you need its fields.
  // webhook-id (the Event ID) is a good idempotency key: Increase retries failed deliveries.
  switch (event.category) {
    case 'transaction.created':
      console.log(`Transaction created: ${event.associated_object_id}`);
      break;
    case 'pending_transaction.created':
      console.log(`Pending transaction created: ${event.associated_object_id}`);
      break;
    case 'account.created':
      console.log(`Account created: ${event.associated_object_id}`);
      break;
    case 'ach_transfer.created':
    case 'ach_transfer.updated':
      console.log(`ACH transfer ${event.associated_object_id} (${event.category})`);
      break;
    case 'card_payment.created':
      console.log(`Card payment created: ${event.associated_object_id}`);
      break;
    default:
      console.log(`Unhandled event category: ${event.category}`);
  }

  return NextResponse.json({ received: true });
}
