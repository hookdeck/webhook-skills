// Generated with: millicast-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { decodeBase64Secret, handleEvent, handleThumbnail, verifyMillicastWebhook } from '../../../lib/verify-millicast';

export async function POST(request: Request) {
  const secret = process.env.MILLICAST_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MILLICAST_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('MILLICAST_WEBHOOK_SECRET is not valid base64: check the value you configured');
    return NextResponse.json({ error: 'Webhook secret is not valid base64' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMillicastWebhook(rawBody, request.headers.get('x-millicast-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Thumbnail hooks send the captured JPEG (Content-Type image/jpeg), signed the same way.
  if (/^image\//i.test(request.headers.get('content-type') ?? '')) {
    return NextResponse.json(handleThumbnail(rawBody, request.headers.get('x-millicast-stream-id')));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleEvent(payload));
}
