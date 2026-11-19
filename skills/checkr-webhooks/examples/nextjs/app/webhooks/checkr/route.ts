// Generated with: checkr-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyCheckrSignature, handleCheckrEvent, type CheckrEvent } from '../../../lib/verify-checkr';

export async function POST(request: Request) {
  const key = process.env.CHECKR_SIGNING_KEY;
  if (!key || !key.trim()) {
    console.error('CHECKR_SIGNING_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyCheckrSignature(rawBody, request.headers.get('x-checkr-signature'), key)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: CheckrEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as CheckrEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleCheckrEvent(event));
}
