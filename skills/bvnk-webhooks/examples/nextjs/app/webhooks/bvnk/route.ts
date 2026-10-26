// Generated with: bvnk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// BVNK sends the standard base64 (padded, 44 chars) HMAC-SHA256 of the raw body in x-signature,
// with no prefix. The key is the secret string's UTF-8 bytes (the "Public Key" field in the BVNK
// Portal); it looks like base64 but is NOT base64-decoded. No timestamp is signed.
// https://docs.bvnk.com/bvnk/get-started/create-webhook-listener
function verifyBvnk(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || typeof signatureHeader !== 'string') return false;
  // Check the shape first: Buffer.from(x, 'base64') silently drops invalid characters, and
  // Hookdeck compares the base64 text exactly, so only the canonical 44-character form passes.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signatureHeader)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const received = Buffer.from(signatureHeader, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BVNK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BVNK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read the bytes before any JSON parsing
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyBvnk(rawBody, request.headers.get('x-signature'), secret)) {
    console.error('BVNK webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // eventId is unique per event: use it to drop duplicates from retries (see webhook-handler-patterns)
  const { event, eventId } = payload;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};

  switch (event) {
    case 'payment:v2:payin:status-change':
      console.log(`[${eventId}] Pay-in status changed`);
      break;
    case 'bvnk:payment:channel:created':
      console.log(`[${eventId}] Payment channel created`);
      break;
    case 'bvnk:payment:channel:transaction-confirmed':
      console.log(`[${eventId}] Channel transaction confirmed`);
      break;
    case 'bvnk:payment:channel:transaction-on-hold':
    case 'bvnk:payment:crypto:transaction-on-hold':
      console.log(`[${eventId}] Transaction on hold (${event})`);
      break;
    case 'bvnk:ledger:report:ready':
      console.log(`[${eventId}] Ledger report ${data.id} (${data.type}) is ${data.status}`);
      break;
    case 'platform:accounts:customer:created':
      console.log(`[${eventId}] Customer created`);
      break;
    case 'platform:accounts:customer:status-change':
    case 'bvnk:customers:status-change':
      console.log(`[${eventId}] Customer status changed (${event})`);
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
