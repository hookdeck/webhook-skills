// Generated with: agora-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Agora webhook signature.
 * Agora-Signature is the bare lowercase hex HMAC-SHA1 of the raw request body
 * (key = the Signing Secret as UTF-8 bytes). Nothing else is signed.
 */
export function verifyAgoraWebhook(
  rawBody: Buffer,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;

  // Validate format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{40}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  // Read the raw bytes before parsing - the signature covers exactly these bytes
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('agora-signature');

  if (!verifyAgoraWebhook(rawBody, signature, process.env.AGORA_WEBHOOK_SECRET)) {
    console.error('Agora webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let event: { productId?: number; eventType?: number; noticeId?: string; payload?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // eventType is a JSON number; productId (1 = RTC) scopes the code space
  const { productId, eventType, noticeId, payload = {} } = event;
  console.log(`Received productId=${productId} eventType=${eventType} noticeId=${noticeId}`);

  if (productId === 1) {
    switch (String(eventType)) {
      case '101':
        console.log(`Channel created: ${payload.channelName}`);
        break;
      case '102':
        console.log(`Channel destroyed: ${payload.channelName}`);
        break;
      case '103':
        console.log(`Broadcaster joined ${payload.channelName}: uid ${payload.uid}`);
        break;
      case '104':
        console.log(`Broadcaster left ${payload.channelName}: uid ${payload.uid}`);
        break;
      default:
        console.log(`Unhandled RTC event: ${eventType}`);
    }
  } else {
    console.log(`Unhandled product ${productId} event: ${eventType}`);
  }

  // Agora wants a 200 with a JSON body within 10 seconds; duplicates happen, so dedupe on noticeId
  return NextResponse.json({ received: true });
}
