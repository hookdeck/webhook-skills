// Generated with: authorize-net-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyAuthorizeNetSignature, handleAuthorizeNetEvent, type AuthorizeNetEvent } from '../../../lib/verify-authorize-net';

export async function POST(request: Request) {
  const secret = process.env.AUTHORIZE_NET_SIGNATURE_KEY;
  if (!secret?.trim()) {
    console.error('AUTHORIZE_NET_SIGNATURE_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyAuthorizeNetSignature(rawBody, request.headers.get('x-anet-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: AuthorizeNetEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as AuthorizeNetEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleAuthorizeNetEvent(event));
}
