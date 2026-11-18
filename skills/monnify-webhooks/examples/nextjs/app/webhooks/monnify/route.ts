// Generated with: monnify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyMonnifySignature, handleMonnifyEvent, type MonnifyEvent } from '../../../lib/verify-monnify';

export async function POST(request: Request) {
  const secret = process.env.MONNIFY_CLIENT_SECRET;
  if (!secret?.trim()) {
    console.error('MONNIFY_CLIENT_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMonnifySignature(rawBody, request.headers.get('monnify-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: MonnifyEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as MonnifyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleMonnifyEvent(event));
}
