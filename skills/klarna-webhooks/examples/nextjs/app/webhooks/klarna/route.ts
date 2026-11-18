// Generated with: klarna-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyKlarnaSignature, handleKlarnaEvent, type KlarnaEvent } from '../../../lib/verify-klarna';

export async function POST(request: Request) {
  const secret = process.env.KLARNA_SIGNING_KEY;
  if (!secret?.trim()) {
    console.error('KLARNA_SIGNING_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyKlarnaSignature(rawBody, request.headers.get('klarna-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: KlarnaEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as KlarnaEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleKlarnaEvent(event));
}
