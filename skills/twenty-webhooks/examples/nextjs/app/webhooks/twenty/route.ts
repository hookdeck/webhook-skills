// Generated with: twenty-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Twenty webhook: X-Twenty-Webhook-Signature is the bare hex
 * HMAC-SHA256 of the bytes "<X-Twenty-Webhook-Timestamp>:" + raw body, keyed
 * with the webhook secret (UTF-8, used as-is).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 * The timestamp is Date.now(), Unix milliseconds.
 */
function verifyTwentySignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  if (!signature || !timestamp || !secret) return false;

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters)
  if (!HEX_64.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }

  // Build the signed message as bytes: "<timestamp>:" + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from(':', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Hex is case-insensitive; compare equal-length buffers in constant time
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
  // Get the raw bytes for signature verification (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifyTwentySignature(
    rawBody,
    request.headers.get('x-twenty-webhook-signature'),
    request.headers.get('x-twenty-webhook-timestamp'),
    process.env.TWENTY_WEBHOOK_SECRET,
    tolerance
  )) {
    console.error('Twenty webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let payload: { eventName?: string; event?: string; record?: Record<string, any>; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Twenty's sender uses `eventName`; its docs page shows `event`
  const eventName = payload?.eventName || payload?.event;
  const record = payload?.record ?? payload?.data ?? {};

  // Handle the event based on <object>.<created|updated|deleted>
  switch (eventName) {
    case 'person.created':
      console.log('Person created:', record.id);
      // TODO: Sync the new contact to your system
      break;

    case 'person.deleted':
      console.log('Person deleted:', record.id);
      // TODO: Remove or archive the contact
      break;

    case 'company.updated':
      console.log('Company updated:', record.id);
      // TODO: Refresh the company in your system
      break;

    case 'opportunity.updated':
      console.log('Opportunity updated:', record.id);
      // TODO: React to stage or amount changes
      break;

    case 'note.created':
      console.log('Note created:', record.id);
      // TODO: Attach the note to the related record
      break;

    default:
      // Any other object (custom objects included) and action: <object>.<action>
      console.log(`Unhandled event: ${eventName}`);
  }

  // Any 2xx acknowledges the delivery
  return NextResponse.json({ received: true });
}
