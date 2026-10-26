// Generated with: jazzhr-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// JazzHR signs the raw body with HMAC-SHA256 (bare hex) in X-JazzHR-Signature.
function verifySignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  // Check the hex first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!signatureHeader || !secret || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}

export async function POST(request: NextRequest) {
  // text() returns the raw body regardless of Content-Type
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get('x-jazzhr-signature'), process.env.JAZZHR_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // The event type is in a header, not the body.
  const eventType = request.headers.get('x-jazzhr-event');

  if (eventType === 'VERIFY') {
    // Signed setup POST sent when the integration is saved; only needs a 200.
    return NextResponse.json({ received: true });
  }

  let payload: { candidate?: { person?: { id?: { value?: string } } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (eventType) {
    case 'CANDIDATE-EXPORT':
      console.log('Candidate exported:', payload.candidate?.person?.id?.value, request.headers.get('x-jazzhr-uuid'));
      break;
    default:
      console.log('Unhandled event:', eventType);
  }

  // Any 2xx acknowledges the delivery.
  return NextResponse.json({ received: true });
}
