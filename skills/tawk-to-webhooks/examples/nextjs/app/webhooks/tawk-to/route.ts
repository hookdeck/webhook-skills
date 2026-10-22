// Generated with: tawk-to-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// tawk.to: lowercase hex HMAC-SHA1 of the raw body, keyed with the webhook secret
function verifyTawkSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Raw body: do not use request.json() before verifying
  const body = await request.text();
  const signature = request.headers.get('x-tawk-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Tawk-Signature header' }, { status: 400 });
  }
  if (!verifyTawkSignature(body, signature, process.env.TAWK_WEBHOOK_SECRET)) {
    console.error('tawk.to signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // X-Hook-Event-Id is stable across retries: use it for idempotency
  const eventId = request.headers.get('x-hook-event-id');
  console.log(`Received ${payload.event} (event id: ${eventId})`);

  switch (payload.event) {
    case 'chat:start':
      console.log('Chat started:', payload.chatId, 'visitor:', payload.visitor?.name);
      break;
    case 'chat:end':
      console.log('Chat ended:', payload.chatId);
      break;
    case 'chat:transcript_created':
      console.log('Transcript created:', payload.chat?.id, 'messages:', payload.chat?.messages?.length);
      break;
    case 'ticket:create':
      console.log('Ticket created:', payload.ticket?.id, payload.ticket?.subject);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  return NextResponse.json({ received: true });
}
