// Generated with: socotra-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifySocotraSignature, toleranceSeconds, type SocotraEvent } from '../../../lib/socotra';

// HMAC verification needs Node's crypto module; deliveries are never cacheable.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhooks deliver an EventResponse: { locator, requestId, userLocator, timestamp, type, data }.
// Dispatch on `type`; the full list is on Socotra's Event Definitions page.
function handleEvent(event: SocotraEvent) {
  switch (event.type) {
    case 'policy.account.create':
      console.log(`Account created: ${event.locator}`);
      break;
    case 'policy.quote.accept':
      console.log(`Quote accepted: ${event.locator}`);
      break;
    case 'policy.quote.issue':
      console.log(`Quote issued: ${event.locator}`);
      break;
    case 'billing.invoice.generate':
      console.log(`Invoice generated: ${event.locator}`);
      break;
    case 'billing.payment.create':
      console.log(`Payment created: ${event.locator}`);
      break;
    case 'document.ready':
      console.log(`Document ready: ${event.locator}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Socotra's docs don't name the HTTP method, so every usual method is handled.
async function handle(request: NextRequest) {
  // Raw bytes (empty when there is no body) — never request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifySocotraSignature(
      rawBody,
      request.headers.get('socotra-signature'),
      process.env.SOCOTRA_WEBHOOK_SECRET,
      toleranceSeconds()
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Verified. Nothing to parse for an empty body, so acknowledge it.
  if (rawBody.length === 0) {
    return NextResponse.json({ received: true });
  }

  let event: SocotraEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleEvent(event);
  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
