// Generated with: fedex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyFedExSignature, handleFedExEvent, type FedExEvent } from '../../../lib/verify-fedex';

export async function POST(request: Request) {
  const secret = process.env.FEDEX_WEBHOOK_SECURITY_TOKEN;
  if (!secret?.trim()) {
    console.error('FEDEX_WEBHOOK_SECURITY_TOKEN is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyFedExSignature(rawBody, request.headers.get('fdx-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: FedExEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as FedExEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleFedExEvent(event));
}
