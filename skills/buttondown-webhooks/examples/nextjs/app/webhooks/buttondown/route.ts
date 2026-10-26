// Generated with: buttondown-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Buttondown signs a delivery only if the webhook has a signing key. The header is
//   X-Buttondown-Signature: sha256=<hex>
// where <hex> is HMAC-SHA256 of the raw request body, keyed with the signing key (UTF-8, used as-is).
// Nothing else is signed: no timestamp, no id, so there is no replay window to check.
// https://docs.buttondown.com/api-webhooks-introduction

function verifyButtondown(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  // Accept the value with or without the sha256= prefix
  const signature = signatureHeader.trim().replace(/^sha256=/i, '');

  // Check for exactly 64 hex chars before Buffer.from(x, 'hex'): invalid hex silently truncates.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(); // 32 bytes
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BUTTONDOWN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BUTTONDOWN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing, whatever the Content-Type is
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyButtondown(rawBody, request.headers.get('x-buttondown-signature'), secret)) {
    console.error('Buttondown webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Payload: { event_type, data }. data holds ids (newsletter, subscriber, ...).
  // Delivery is at least once and unordered: make handlers idempotent.
  const data = event.data || {};
  switch (event.event_type) {
    case 'subscriber.created':
      console.log(`Subscriber ${data.subscriber} created on newsletter ${data.newsletter}`);
      break;
    case 'subscriber.confirmed':
      console.log(`Subscriber ${data.subscriber} confirmed on newsletter ${data.newsletter}`);
      break;
    case 'subscriber.unsubscribed':
      console.log(`Subscriber ${data.subscriber} unsubscribed from newsletter ${data.newsletter}`);
      break;
    case 'email.sent':
      console.log(`Email ${data.email} finished sending`);
      break;
    case 'automation.invoked':
      console.log(`Automation invoked on newsletter ${data.newsletter}`);
      break;
    default:
      console.log(`Unhandled event: ${event.event_type}`);
  }

  return NextResponse.json({ received: true });
}
