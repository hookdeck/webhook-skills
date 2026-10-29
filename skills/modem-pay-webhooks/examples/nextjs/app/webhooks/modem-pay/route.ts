// Generated with: modem-pay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyModemPay } from '../../../lib/modem-pay';

type Obj = Record<string, unknown>;
const isObject = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

export async function POST(request: NextRequest) {
  const secret = process.env.MODEM_PAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MODEM_PAY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes before any JSON parsing: the signature covers them (any Content-Type).
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyModemPay(rawBody, request.headers.get('x-modem-signature'), secret)) {
    console.error('Modem Pay webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verified. Now parse, and treat every field as untrusted until its type is checked.
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event) || typeof event.event !== 'string' || !isObject(event.payload)) {
    return NextResponse.json({ error: 'Expected {"event": string, "payload": object}' }, { status: 400 });
  }

  const payload = event.payload;
  // There is no delivery id: dedupe retries on (event, payload.id), e.g. in a unique DB index.
  const ref = str(payload.id) ?? '(no id)';

  switch (event.event) {
    case 'charge.succeeded':
      console.log(`Charge succeeded: ${ref} ${payload.amount} ${str(payload.currency) ?? ''}`.trimEnd());
      // TODO: mark the order paid (check payload.test_mode before fulfilling)
      break;
    case 'charge.updated':
      console.log(`Charge updated: ${ref} status=${str(payload.status) ?? 'unknown'}`);
      break;
    case 'payment_intent.created':
      console.log(`Payment intent created: ${ref}`);
      break;
    case 'customer.created':
      console.log(`Customer created: ${ref}`);
      break;
    case 'transfer.succeeded':
      console.log(`Transfer succeeded: ${ref}`);
      break;
    case 'transfer.failed':
      console.log(`Transfer failed: ${ref}`);
      break;
    default:
      // Acknowledge events this handler doesn't process so Modem Pay doesn't retry them
      console.log(`Unhandled Modem Pay event: ${event.event}`);
  }

  // Answer 200 quickly: anything else makes Modem Pay retry (up to 3 times, 10 minutes apart)
  return NextResponse.json({ received: true });
}
