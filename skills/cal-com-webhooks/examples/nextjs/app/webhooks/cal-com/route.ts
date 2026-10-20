// Generated with: cal-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Cal.com webhook signature.
 *
 * Cal.com sends `x-cal-signature-256` = lowercase hex HMAC-SHA256 of the raw
 * body, keyed on the webhook's secret. Webhooks without a secret send the
 * literal "no-secret-provided", which fails this check.
 */
export function verifyCalComWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

interface CalComEvent {
  triggerEvent: string;
  createdAt?: string;
  payload?: Record<string, any>;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CALCOM_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw body BEFORE parsing — the signature is over the exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('x-cal-signature-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }
  if (!verifyCalComWebhook(rawBody, signature, secret)) {
    console.error('Cal.com webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: CalComEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // MEETING_STARTED / MEETING_ENDED use a flat payload (no `payload` wrapper)
  const data: Record<string, any> = event.payload ?? event;
  const version = request.headers.get('x-cal-webhook-version');
  console.log(`Received ${event.triggerEvent} (version ${version})`);

  switch (event.triggerEvent) {
    case 'BOOKING_CREATED':
      console.log(`Booking created: ${data.uid} "${data.title}" at ${data.startTime}`);
      // TODO: Create CRM record, send custom confirmation, etc.
      break;

    case 'BOOKING_REQUESTED':
      console.log(`Booking requested (awaiting confirmation): ${data.uid}`);
      break;

    case 'BOOKING_RESCHEDULED':
      console.log(`Booking rescheduled: ${data.rescheduleUid} -> ${data.uid} at ${data.startTime}`);
      // TODO: Update calendar / CRM with the new time
      break;

    case 'BOOKING_CANCELLED':
      console.log(`Booking cancelled: ${data.uid} (${data.cancellationReason || 'no reason'})`);
      // TODO: Release resources, issue refunds, etc.
      break;

    case 'BOOKING_REJECTED':
      console.log(`Booking rejected: ${data.uid} (${data.rejectionReason || 'no reason'})`);
      break;

    case 'BOOKING_PAID':
      console.log(`Booking paid: ${data.uid} (payment ${data.paymentId})`);
      // TODO: Mark order as paid
      break;

    case 'MEETING_STARTED':
      console.log(`Meeting started: ${data.uid}`);
      break;

    case 'MEETING_ENDED':
      console.log(`Meeting ended: ${data.uid}`);
      // TODO: Send follow-up email, survey, invoice
      break;

    case 'RECORDING_READY':
      console.log(`Recording ready for: ${data.title}`);
      break;

    case 'FORM_SUBMITTED':
      console.log(`Routing form submitted: ${data.formName} (${data.formId})`);
      break;

    default:
      console.log(`Unhandled event: ${event.triggerEvent}`);
  }

  // Acknowledge quickly; do slow work asynchronously
  return NextResponse.json({ received: true });
}
