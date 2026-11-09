// Generated with: pylon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Pylon's docs tell receivers to reject a timestamp more than 5 minutes from now.
// Retries are re-signed with a fresh timestamp, so they pass this check.
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Pylon webhook (X-Pylon-Signature-V2).
 *
 * Pylon signs `timestamp + "." + rawBody` with HMAC-SHA256, keyed with the webhook
 * secret used as-is (do not hex-decode it), and sends the hex digest in
 * X-Pylon-Signature-V2. The timestamp is in X-Pylon-Timestamp (Unix seconds).
 */
function verifyPylonWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  nowSeconds = Date.now() / 1000
): boolean {
  if (!timestamp || !signature || !secret) {
    return false;
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pylon lets you pick the method per webhook; POST is the default.
export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const body = await request.text();
  const timestamp = request.headers.get('x-pylon-timestamp');
  const signature = request.headers.get('x-pylon-signature-v2');
  const retryNumber = request.headers.get('x-pylon-retry-number'); // retries only

  if (!verifyPylonWebhook(body, timestamp, signature, process.env.PYLON_WEBHOOK_SECRET)) {
    console.error('Pylon webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(body);

  // Pylon's "Test" button sends this body.
  if (payload.data?.type === 'ping') {
    console.log('Received Pylon test ping');
    return NextResponse.json({ received: true });
  }

  // The body is the JSON template you wrote in the trigger's Send webhook
  // action, so these field names are yours. Every value arrives as a string.
  // This example uses the template from Pylon's docs.
  console.log(
    `Received Pylon webhook for issue ${payload.issue_id} (#${payload.number}): ${payload.title}` +
      (retryNumber ? ` [retry ${retryNumber}]` : '')
  );

  // TODO: Pylon sends no event ID, so de-duplicate on fields from your
  // template (for example issue_id plus the field that changed).

  return NextResponse.json({ received: true });
}
