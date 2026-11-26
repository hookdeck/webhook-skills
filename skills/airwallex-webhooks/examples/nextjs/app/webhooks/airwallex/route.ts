// Generated with: airwallex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Airwallex's x-timestamp is in MILLISECONDS. The docs don't mandate a window;
// 5 minutes tolerates retries and clock skew.
const TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verify an Airwallex webhook signature.
 *
 * HMAC-SHA256 over `x-timestamp + raw_body` (timestamp first), keyed with the
 * endpoint secret, hex-encoded, sent as the `x-signature` header. Hash the raw
 * request body — never re-serialized JSON.
 */
function verifyAirwallexSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  if (!timestamp || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface AirwallexEvent {
  id: string;
  name: string;
  account_id?: string;
  data?: { object?: Record<string, unknown> };
  created_at?: string;
}

export async function POST(request: NextRequest) {
  // Read the RAW body first — required for signature verification.
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-timestamp');
  const signature = request.headers.get('x-signature');

  if (!timestamp || !signature) {
    return NextResponse.json(
      { error: 'Missing x-timestamp or x-signature header' },
      { status: 400 }
    );
  }

  // Optional replay protection.
  if (Math.abs(Date.now() - Number(timestamp)) > TOLERANCE_MS) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 400 });
  }

  // Verify BEFORE parsing.
  if (!verifyAirwallexSignature(rawBody, timestamp, signature, process.env.AIRWALLEX_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: AirwallexEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Dispatch on the event `name` (Airwallex uses `name`, not `type`).
  const resource = event.data?.object as { id?: string } | undefined;
  switch (event.name) {
    case 'payment_intent.succeeded':
      console.log('PaymentIntent succeeded:', resource?.id);
      // Your code: fulfill the order, send a receipt, etc.
      break;

    case 'payment_attempt.paid':
      console.log('Payment attempt paid:', resource?.id);
      // Your code: mark the attempt as paid.
      break;

    case 'refund.settled':
      console.log('Refund settled:', resource?.id);
      // Your code: reconcile the refund.
      break;

    case 'refund.failed':
      console.log('Refund failed:', resource?.id);
      // Your code: alert / retry the refund.
      break;

    case 'payment_consent.verified':
      console.log('Payment consent verified:', resource?.id);
      // Your code: enable recurring / merchant-initiated payments.
      break;

    case 'payment_dispute.requires_response':
      console.log('Dispute requires response:', resource?.id);
      // Your code: gather and submit evidence before the deadline.
      break;

    default:
      console.log(`Unhandled event type: ${event.name}`);
  }

  // Acknowledge quickly; do heavy work asynchronously.
  return NextResponse.json({ received: true });
}
