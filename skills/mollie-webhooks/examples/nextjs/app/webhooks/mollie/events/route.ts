// Generated with: mollie-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Next-gen Mollie webhooks: subscriptions created in the Dashboard
// (Developers → Webhooks) or via POST /v2/webhooks. Each delivery is a JSON event
// signed with `X-Mollie-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.
// Classic (per-payment `webhookUrl`) webhooks are unsigned and handled by
// app/webhooks/mollie/route.ts instead — Mollie recommends a separate URL for each.

// During a secret rotation Mollie sends the header twice for 24 hours; the Fetch
// API joins repeated headers as "sha256=<a>, sha256=<b>", so accept if any matches.
export function verifyMollieSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader.split(',').some((value) => {
    const provided = value.trim().replace(/^sha256=/, '');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

interface MollieEvent {
  resource: 'event';
  id: string;
  type: string;
  entityId: string;
  createdAt: string;
  _embedded?: { entity?: Record<string, unknown> }; // present with the full payload
}

// Act on a verified event. Keep this idempotent — Mollie retries on non-200.
function handleEvent(event: MollieEvent) {
  switch (event.type) {
    case 'payment.paid':
      console.log(`Payment ${event.entityId} paid`);
      // TODO: fulfill the order
      break;
    case 'payment.authorized':
      console.log(`Payment ${event.entityId} authorized (capture to collect)`);
      break;
    case 'payment.canceled':
    case 'payment.expired':
    case 'payment.failed':
      console.log(`Payment ${event.entityId} did not complete: ${event.type}`);
      break;
    case 'payment-link.paid':
      console.log(`Payment link ${event.entityId} paid`);
      break;
    case 'sales-invoice.paid':
      console.log(`Sales invoice ${event.entityId} paid`);
      break;
    case 'payout.completed':
    case 'payout.failed':
      console.log(`Payout ${event.entityId}: ${event.type}`);
      break;
    default:
      console.log(`Unhandled Mollie event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.MOLLIE_WEBHOOK_SECRET;
  if (!secret) {
    // Never fail open: without a secret we cannot verify anything.
    console.error('MOLLIE_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Read the RAW body — the signature covers the exact bytes Mollie sent.
  const rawBody = await request.text();
  const signature = request.headers.get('x-mollie-signature');

  if (!verifyMollieSignature(rawBody, signature, secret)) {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: MollieEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  handleEvent(event);
  return new NextResponse('OK', { status: 200 });
}
