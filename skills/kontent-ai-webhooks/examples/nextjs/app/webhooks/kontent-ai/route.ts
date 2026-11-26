// Generated with: kontent-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyKontentAiSignature, handleKontentAiEvent, type KontentAiEvent } from '../../../lib/verify-kontent-ai';

export async function POST(request: Request) {
  const secret = process.env.KONTENT_AI_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    console.error('KONTENT_AI_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyKontentAiSignature(rawBody, request.headers.get('x-kontent-ai-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: KontentAiEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as KontentAiEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleKontentAiEvent(event));
}
