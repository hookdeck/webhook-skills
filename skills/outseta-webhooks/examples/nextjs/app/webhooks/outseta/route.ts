// Generated with: outseta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { decodeHexSecret, handleEvent, verifyOutsetaWebhook } from '../../../lib/verify-outseta';

export async function POST(request: Request) {
  const secret = process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY;
  if (!secret) {
    console.error('OUTSETA_WEBHOOK_SIGNATURE_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!decodeHexSecret(secret)) {
    console.error('OUTSETA_WEBHOOK_SIGNATURE_KEY is not valid hex: check the value you configured');
    return NextResponse.json({ error: 'Webhook secret is not valid hex' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyOutsetaWebhook(rawBody, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleEvent(payload, rawBody));
}
