// Generated with: dojah-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Dojah signs the raw POST body with HMAC-SHA256 keyed on the subscription's
 * webhook secret (UTF-8) and sends a bare lowercase hex digest in
 * x-dojah-signature (no prefix, no timestamp). x-dojah-signature-v2 is a static
 * hash of the secret with no payload, so it is not checked here.
 */
function verifyDojahSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret || typeof signatureHeader !== 'string') {
    return false;
  }

  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}

export async function POST(request: NextRequest) {
  // Read the raw bytes: parsing JSON first would change the signed bytes
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Missing, empty, malformed or mismatched signature: 401
  if (
    !verifyDojahSignature(
      rawBody,
      request.headers.get('x-dojah-signature'),
      process.env.DOJAH_WEBHOOK_SECRET
    )
  ) {
    console.error('Dojah webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Treat every field as untrusted: check types before reading into the body
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return new NextResponse('Invalid payload', { status: 400 });
  }
  const event = payload as Record<string, unknown>;

  // No event-name field: the URL is subscribed to one service. For kyc_widget,
  // dispatch on verification_status and look the session up by reference_id.
  const referenceId = typeof event.reference_id === 'string' ? event.reference_id : undefined;

  switch (event.verification_status) {
    case 'Completed':
      // Completed means finished, not passed: check the top-level status too
      if (event.status === true) {
        console.log('Verification completed and passed:', referenceId);
      } else {
        console.log('Verification completed but not passed:', referenceId);
      }
      break;
    case 'Failed':
      console.log('Verification failed:', referenceId);
      break;
    case 'Abandoned':
      console.log('Verification abandoned:', referenceId);
      break;
    case 'Pending':
      console.log('Verification pending review:', referenceId);
      break;
    case 'Ongoing':
      console.log('Verification ongoing:', referenceId);
      break;
    default:
      // Other services (sms, address, AML Monitoring) have their own shapes
      console.log('Unhandled Dojah event');
  }

  return NextResponse.json({ received: true });
}
