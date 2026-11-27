// Generated with: oura-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Oura webhook signature.
 *
 * HMAC-SHA256 over (x-oura-timestamp + raw body), keyed with the client secret,
 * hex-encoded and UPPERCASED, compared timing-safely to the x-oura-signature header.
 */
export function verifyOuraSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  clientSecret: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(timestamp + rawBody)
    .digest('hex')
    .toUpperCase();

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Different lengths = invalid
    return false;
  }
}

/**
 * Subscription handshake (GET).
 * Oura calls this when you create a subscription.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verificationToken = params.get('verification_token');
  const challenge = params.get('challenge');

  if (verificationToken && verificationToken === process.env.OURA_VERIFICATION_TOKEN) {
    // Echo the challenge back as JSON to activate the subscription
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 401 });
}

/**
 * Event delivery (POST). Uses the raw body for signature verification.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-oura-signature');
  const timestamp = request.headers.get('x-oura-timestamp');

  // Verify the signature before trusting the payload
  if (!verifyOuraSignature(rawBody, signature, timestamp, process.env.OURA_CLIENT_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the (thin) payload after verification
  const { event_type, data_type, object_id, event_time, user_id } = JSON.parse(rawBody);
  console.log(`Received ${event_type} ${data_type} for user ${user_id} (object ${object_id})`);

  // Dispatch on data_type. Payloads are thin — fetch the full record via the API
  // using object_id, e.g. GET /v2/usercollection/{data_type}/{object_id}.
  switch (data_type) {
    case 'sleep':
      console.log(`Sleep ${event_type} at ${event_time}`);
      // Your code: fetch GET /v2/usercollection/sleep/{object_id}
      break;

    case 'daily_sleep':
      console.log(`Daily sleep summary ${event_type}`);
      // Your code: fetch GET /v2/usercollection/daily_sleep/{object_id}
      break;

    case 'daily_readiness':
      console.log(`Daily readiness ${event_type}`);
      // Your code: fetch GET /v2/usercollection/daily_readiness/{object_id}
      break;

    case 'daily_activity':
      console.log(`Daily activity ${event_type}`);
      // Your code: fetch GET /v2/usercollection/daily_activity/{object_id}
      break;

    case 'workout':
      console.log(`Workout ${event_type}`);
      // Your code: fetch GET /v2/usercollection/workout/{object_id}
      break;

    default:
      console.log(`Unhandled data_type: ${data_type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
