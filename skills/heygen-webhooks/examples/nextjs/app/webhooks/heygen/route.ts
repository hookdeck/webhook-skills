// Generated with: heygen-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// HeyGen signs the raw body with HMAC-SHA256 (hex) in the `signature` header.
// The key is the whole endpoint secret (including "whsec_") as a UTF-8 string.
// This is NOT Standard Webhooks: no svix/standardwebhooks library, no base64 decoding.
function verifyHeyGenSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Raw body text, read before any JSON parsing
  const rawBody = await request.text();

  const signature = request.headers.get('signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  if (!verifyHeyGenSignature(rawBody, signature, process.env.HEYGEN_WEBHOOK_SECRET || '')) {
    console.error('HeyGen webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event_type?: string; event_data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = event.event_data ?? {};

  // Retries resend the same payload: dedupe on event_data.video_id + event_type
  switch (event.event_type) {
    case 'avatar_video.success':
      console.log('Avatar video ready:', data.video_id, data.url);
      // TODO: Download the file (the URL is pre-signed and expires) and notify the user
      break;

    case 'avatar_video.fail':
      console.log('Avatar video failed:', data.video_id);
      // TODO: Mark the video as failed and alert the user
      break;

    case 'video_translate.success':
      console.log('Video translation complete:', data);
      // TODO: GET /v3/video-translations/{id} and store the translated video
      break;

    case 'video_translate.fail':
      console.log('Video translation failed:', data);
      // TODO: Mark the translation as failed
      break;

    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  // Return 2xx within 10 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}
