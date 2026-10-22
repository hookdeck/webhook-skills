// Generated with: unit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Unit signs the ENTIRE raw body with HMAC-SHA1, keyed by the webhook token
// (a UTF-8 string), and sends the base64 digest in X-Unit-Signature.
function verifyUnitSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  token: string | undefined
): boolean {
  if (!signatureHeader || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface UnitEvent {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } }>;
}

export async function POST(request: NextRequest) {
  // Read the RAW bytes (any content type) - never parse JSON before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-unit-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Unit-Signature header' }, { status: 400 });
  }
  if (!verifyUnitSignature(rawBody, signature, process.env.UNIT_WEBHOOK_TOKEN)) {
    console.error('Unit webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { data?: UnitEvent[] };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // `data` is an array of events (up to 64 with AtLeastOnce delivery).
  const events = Array.isArray(payload.data) ? payload.data : [];

  for (const event of events) {
    // TODO: dedupe on event.id (Unit retries AtLeastOnce deliveries)
    switch (event.type) {
      case 'application.approved':
        console.log('Application approved:', event.relationships?.application?.data?.id);
        // TODO: Start onboarding for the new customer
        break;

      case 'application.denied':
        console.log('Application denied:', event.relationships?.application?.data?.id);
        // TODO: Notify the applicant
        break;

      case 'customer.created':
        console.log('Customer created:', event.relationships?.customer?.data?.id);
        // TODO: Sync the customer record
        break;

      case 'account.created':
        console.log('Account created:', event.relationships?.account?.data?.id);
        // TODO: Store the account id
        break;

      case 'transaction.created':
        console.log('Transaction created:', event.relationships?.transaction?.data?.id);
        // TODO: Update your ledger
        break;

      case 'payment.clearing':
        console.log('Payment clearing:', event.relationships?.payment?.data?.id);
        // TODO: Mark the payment as clearing
        break;

      case 'payment.returned':
        console.log('Payment returned:', event.relationships?.payment?.data?.id);
        // TODO: Reverse the payment and alert
        break;

      default:
        // Unit adds event types over time; ignore the ones you don't handle.
        console.log('Unhandled event type:', event.type);
    }
  }

  // Unit expects HTTP 200 (AtMostOnce deliveries are not retried otherwise).
  return NextResponse.json({ received: true }, { status: 200 });
}
