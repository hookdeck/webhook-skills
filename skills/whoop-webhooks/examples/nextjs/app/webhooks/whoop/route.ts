// Generated with: whoop-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X-WHOOP-Signature is the 44-character padded base64 of a 32-byte digest
const SIG_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a WHOOP webhook signature.
 *
 * base64(HMAC-SHA256(client_secret, X-WHOOP-Signature-Timestamp + raw body)),
 * with no separator between the timestamp and the body.
 */
export function verifyWhoopSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !timestamp || !secret || !SIG_RE.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]))
    .digest('base64');

  // Both are 44 ASCII characters here, so the lengths always match
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'latin1'),
    Buffer.from(expected, 'latin1')
  );
}

/**
 * Optional replay protection. Off unless a positive tolerance is configured,
 * because Hookdeck retries and replays resend the original timestamp.
 * The timestamp is Unix MILLISECONDS.
 */
export function isTimestampFresh(
  timestamp: string,
  toleranceSeconds: number | undefined,
  now: number = Date.now()
): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }
  return Math.abs(now - Number(timestamp)) <= toleranceSeconds * 1000;
}

export async function POST(request: NextRequest) {
  // Exact bytes, not text: the signature covers the raw body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-whoop-signature');
  const timestamp = request.headers.get('x-whoop-signature-timestamp');

  // Verify the signature before trusting the payload
  if (!verifyWhoopSignature(rawBody, signature, timestamp, process.env.WHOOP_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (!isTimestampFresh(timestamp!, Number(process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS))) {
    console.error('Webhook timestamp outside tolerance');
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, id, user_id, trace_id } = event;
  console.log(`Received ${type} for user ${user_id} (id ${id}, trace ${trace_id})`);

  // Payloads are thin: fetch the record from the v2 API using `id`.
  // For recovery.* events, `id` is the UUID of the associated sleep.
  switch (type) {
    case 'sleep.updated':
      // TODO: GET /v2/activity/sleep/{id}
      console.log(`Sleep ${id} created or updated`);
      break;

    case 'workout.updated':
      // TODO: GET /v2/activity/workout/{id}
      console.log(`Workout ${id} created or updated`);
      break;

    case 'recovery.updated':
      // TODO: fetch the recovery for sleep {id}
      console.log(`Recovery for sleep ${id} created or updated`);
      break;

    default:
      // sleep.deleted, workout.deleted, recovery.deleted and anything new
      console.log(`Unhandled event type: ${type}`);
  }

  return NextResponse.json({ received: true });
}
