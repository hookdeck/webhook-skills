// Generated with: dentally-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Dentally signs the raw POST body with HMAC-SHA256 keyed on the webhook
 * endpoint's secret (UTF-8) and sends a bare lowercase hex digest in
 * X-Dentally-Signature (no prefix, no timestamp).
 */
function verifyDentallySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string | undefined
): boolean {
  if (!secret) {
    return false;
  }

  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}

export async function POST(request: NextRequest) {
  // Read the raw body: parsing JSON first would change the signed bytes
  const rawBody = await request.text();
  const signature = request.headers.get('x-dentally-signature');

  if (!signature) {
    return new NextResponse('Missing X-Dentally-Signature header', { status: 400 });
  }

  if (!verifyDentallySignature(rawBody, signature, process.env.DENTALLY_WEBHOOK_SECRET)) {
    console.error('Dentally webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: { event?: string; object?: string; data?: { id?: number | string; state?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Payload shape: { data, event, object, user }
  switch (payload.event) {
    case 'appointment.created':
      console.log('Appointment created:', payload.data?.id);
      break;
    case 'appointment.updated':
      console.log('Appointment updated:', payload.data?.id, payload.data?.state);
      break;
    case 'appointment.deleted':
      console.log('Appointment deleted:', payload.data?.id);
      break;
    case 'patient.created':
      console.log('Patient created:', payload.data?.id);
      break;
    case 'patient.updated':
      console.log('Patient updated:', payload.data?.id);
      break;
    case 'patient.deleted':
      console.log('Patient deleted:', payload.data?.id);
      break;
    case 'payment.created':
      console.log('Payment created:', payload.data?.id);
      break;
    case 'payment.updated':
      console.log('Payment updated:', payload.data?.id);
      break;
    case 'payment.deleted':
      console.log('Payment deleted:', payload.data?.id);
      break;
    default:
      // Dentally may add events at any time: ignore unknown ones with 204
      console.log('Unhandled Dentally event:', payload.event);
      return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ received: true });
}
