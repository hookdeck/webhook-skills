// Generated with: juniper-mist-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyMistSignature, handleMistEvent, type MistWebhook } from '../../../lib/verify-juniper-mist';

export async function POST(request: Request) {
  const secret = process.env.MIST_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    console.error('MIST_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMistSignature(rawBody, request.headers.get('x-mist-signature-v2'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: MistWebhook;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as MistWebhook;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleMistEvent(event));
}
