// Generated with: fireflies-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Fireflies Webhooks V2 signature.
 *
 * V2 signs the raw request body with HMAC-SHA256 keyed on the signing secret
 * you configured at webhook setup, and sends the digest in the
 * `X-Hub-Signature` header as `sha256=<hex>`. The `sha256=` prefix is required.
 */
export function verifyFirefliesWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  // Fail closed: no header or no configured secret means we cannot verify
  if (!signatureHeader || !secret) {
    return false;
  }

  // V2 requires the `sha256=` prefix - reject anything else (including a bare
  // hex digest) rather than guessing at the format
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice('sha256='.length);

  // Compute expected signature over the raw body (hex-encoded)
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHex, 'hex'),
      Buffer.from(expectedHex, 'hex')
    );
  } catch {
    // Different lengths / non-hex header means invalid
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature');
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;

  // The V2 signing secret is optional at webhook setup. When it is unset,
  // Fireflies sends no X-Hub-Signature header at all, so there is nothing to
  // verify. This example accepts those deliveries with a loud warning so an
  // unconfigured setup still works end to end - set a secret in production.
  if (!secret) {
    console.warn(
      'FIREFLIES_WEBHOOK_SECRET is not set - accepting this delivery UNVERIFIED. ' +
      'Configure a signing secret on the Fireflies Webhooks V2 page and set it here.'
    );
  } else if (!verifyFirefliesWebhook(body, signature, secret)) {
    // A secret is configured, so every delivery must carry a valid signature
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const { event, meeting_id: meetingId, client_reference_id: clientReferenceId, timestamp } = payload;

  console.log(`Received "${event}" event for meeting ${meetingId} (ts: ${timestamp})`);

  // Handle the event based on its type (Fireflies puts the type in the body)
  switch (event) {
    case 'meeting.transcribed':
      console.log(`Transcript ready for meeting ${meetingId}` +
        (clientReferenceId ? ` (ref: ${clientReferenceId})` : ''));
      // Your code: fetch the transcript from the Fireflies GraphQL API using
      // meeting_id, then sync notes, post to Slack, update your CRM, etc.
      break;

    case 'meeting.summarized':
      console.log(`Summary ready for meeting ${meetingId}`);
      // Your code: fetch the AI summary / action items and route them onward.
      break;

    case 'meeting.bot_joined':
      console.log(`Fred bot joined meeting ${meetingId}`);
      // Your code: mark the meeting as being recorded, notify participants, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event}`);
  }

  // Return 200 to acknowledge receipt (Fireflies expects a 2xx within 30s)
  return NextResponse.json({ received: true });
}
