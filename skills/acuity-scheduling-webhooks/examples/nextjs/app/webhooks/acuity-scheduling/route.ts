// Generated with: acuity-scheduling-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Acuity Scheduling webhook signature.
 *
 * Acuity sends the base64 HMAC-SHA256 of the raw request body, keyed with the
 * account API key, in the `X-Acuity-Signature` header. There is no timestamp.
 */
function verifyAcuitySignature(
  rawBody: string,
  signatureHeader: string | null,
  apiKey: string | undefined
): boolean {
  if (!signatureHeader || !apiKey) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison (lengths must match first, or timingSafeEqual throws)
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification — do not parse the form first
  const rawBody = await request.text();
  const signature = request.headers.get('x-acuity-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Acuity-Signature header' },
      { status: 400 }
    );
  }

  // Acuity signs with your account API key (no separate webhook secret)
  if (!verifyAcuitySignature(rawBody, signature, process.env.ACUITY_API_KEY)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Signature is valid — safe to parse the form-encoded body
  const params = new URLSearchParams(rawBody);
  const action = params.get('action');
  const id = params.get('id');

  switch (action) {
    case 'scheduled':
      console.log('Appointment scheduled:', id, 'calendar', params.get('calendarID'));
      // TODO: Fetch the appointment by ID, create CRM record, send confirmation, etc.
      break;

    case 'rescheduled':
      console.log('Appointment rescheduled:', id);
      // TODO: Update calendar entries, notify staff, etc.
      break;

    case 'canceled':
      console.log('Appointment canceled:', id);
      // TODO: Free up capacity, trigger follow-up, update CRM, etc.
      break;

    case 'changed':
      console.log('Appointment changed:', id);
      // TODO: Re-sync the appointment (catch-all; may duplicate the actions above)
      break;

    case 'order.completed':
      console.log('Order completed:', id);
      // TODO: Fetch the order, provision package or gift certificate credit, etc.
      break;

    default:
      console.log(`Unhandled action: ${action}`);
  }

  // Return 2xx to acknowledge receipt (Acuity retries only on 500 or network errors)
  return NextResponse.json({ received: true });
}
