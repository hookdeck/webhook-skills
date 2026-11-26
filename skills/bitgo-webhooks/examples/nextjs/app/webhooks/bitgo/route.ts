// Generated with: bitgo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyBitGoSignature, handleBitGoEvent, type BitGoEvent } from '../../../lib/verify-bitgo';

export async function POST(request: Request) {
  const secret = process.env.BITGO_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    console.error('BITGO_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyBitGoSignature(rawBody, request.headers.get('x-signature-sha256'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: BitGoEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as BitGoEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleBitGoEvent(event));
}
