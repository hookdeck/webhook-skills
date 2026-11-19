// Generated with: mindbody-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyMindbodySignature, handleMindbodyEvent, type MindbodyEvent } from '../../../lib/verify-mindbody';

// Mindbody checks the URL with a HEAD request. It carries no body or
// signature: answer 200 and do nothing else.
export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  const secret = process.env.MINDBODY_MESSAGE_SIGNATURE_KEY;
  if (!secret?.trim()) {
    console.error('MINDBODY_MESSAGE_SIGNATURE_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMindbodySignature(rawBody, request.headers.get('x-mindbody-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: MindbodyEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as MindbodyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleMindbodyEvent(event));
}
