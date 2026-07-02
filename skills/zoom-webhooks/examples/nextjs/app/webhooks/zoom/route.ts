// Generated with: zoom-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Zoom webhook signature.
 *
 * Zoom signs `v0:{timestamp}:{rawBody}` with HMAC-SHA256 keyed on the app's
 * Secret Token and sends it in the `x-zm-signature` header as `v0=<hex>`.
 */
export function verifyZoomWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secretToken: string
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  const message = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secretToken).update(message).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Length mismatch = invalid
  }
}

/**
 * Build the response body for Zoom's one-time endpoint.url_validation challenge.
 * encryptedToken = HMAC-SHA256(plainToken, secretToken) as hex.
 */
export function buildValidationResponse(plainToken: string, secretToken: string) {
  const encryptedToken = crypto
    .createHmac('sha256', secretToken)
    .update(plainToken)
    .digest('hex');
  return { plainToken, encryptedToken };
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse before verifying)
  const rawBody = await request.text();
  const signature = request.headers.get('x-zm-signature');
  const timestamp = request.headers.get('x-zm-request-timestamp');
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN!;

  // Verify webhook signature
  if (!verifyZoomWebhook(rawBody, timestamp, signature, secretToken)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(rawBody);
  const event = payload.event;

  // Answer the one-time URL validation handshake
  if (event === 'endpoint.url_validation') {
    const response = buildValidationResponse(
      payload.payload.plainToken,
      secretToken
    );
    return NextResponse.json(response, { status: 200 });
  }

  console.log(`Received ${event} event`);

  // Handle the event based on type
  const object = payload.payload?.object;
  switch (event) {
    case 'meeting.started':
      console.log(`Meeting started: ${object?.topic} (${object?.id})`);
      // TODO: Start recording bot, notify team, begin tracking, etc.
      break;

    case 'meeting.ended':
      console.log(`Meeting ended: ${object?.topic} (${object?.id})`);
      // TODO: Trigger follow-ups, compute duration, close sessions, etc.
      break;

    case 'meeting.participant_joined':
      console.log(
        `Participant joined ${object?.id}: ${object?.participant?.user_name}`
      );
      // TODO: Attendance tracking, greetings, presence updates, etc.
      break;

    case 'meeting.participant_left':
      console.log(
        `Participant left ${object?.id}: ${object?.participant?.user_name}`
      );
      // TODO: Attendance tracking, drop-off analytics, etc.
      break;

    case 'recording.completed':
      console.log(`Recording completed for meeting ${object?.id}`);
      // TODO: Download recording, transcribe, publish, notify, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt (within 3 seconds)
  return NextResponse.json({ received: true });
}
