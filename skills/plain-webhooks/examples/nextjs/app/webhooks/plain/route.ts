// Generated with: plain-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Plain request signature.
 * Plain sends hex(HMAC-SHA256(secret, rawBody)) in the Plain-Request-Signature header.
 */
function verifyPlainSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  // Reject anything that is not exactly 64 hex chars before comparing.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase(), 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false; // different lengths = invalid
  }
}

/**
 * Optional replay check (off unless PLAIN_TOLERANCE_SECONDS is set). The timestamp lives in the
 * body (webhookMetadata.webhookDeliveryAttemptTimestamp), not in the signature.
 */
function isTimestampFresh(event: any, toleranceSeconds: number): boolean {
  const ts = Date.parse(event?.webhookMetadata?.webhookDeliveryAttemptTimestamp);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= toleranceSeconds * 1000;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.PLAIN_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('PLAIN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw body for signature verification (do not JSON.parse first).
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('plain-request-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Plain-Request-Signature header' }, { status: 400 });
  }

  if (!verifyPlainSignature(rawBody, signature, webhookSecret)) {
    console.error('Plain webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { id?: string; payload?: any; webhookMetadata?: any };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tolerance = Number(process.env.PLAIN_TOLERANCE_SECONDS);
  if (tolerance > 0 && !isTimestampFresh(event, tolerance)) {
    return NextResponse.json({ error: 'Stale webhook timestamp' }, { status: 400 });
  }

  // The event type is in payload.eventType (also sent as the Plain-Event-Type header).
  // event.id is stable across retries: use it as the idempotency key.
  const eventType: string | undefined = event.payload?.eventType;

  switch (eventType) {
    case 'thread.thread_created':
      console.log('Thread created:', event.payload.thread?.id);
      break;
    case 'thread.email_received':
      console.log('Email received on thread:', event.payload.thread?.id);
      break;
    case 'thread.thread_status_transitioned':
      console.log('Thread status changed:', event.payload.thread?.id);
      break;
    case 'customer.customer_created':
      console.log('Customer created:', event.payload.customer?.id);
      break;
    default:
      console.log('Unhandled Plain event:', eventType);
  }

  return NextResponse.json({ received: true });
}
