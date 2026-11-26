// Generated with: makeplans-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyMakePlansSignature, handleMakePlansEvent, type MakePlansEvent } from '../../../lib/verify-makeplans';

export async function POST(request: Request) {
  const secret = process.env.MAKEPLANS_ACCOUNT_SECRET;
  if (!secret?.trim()) {
    console.error('MAKEPLANS_ACCOUNT_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyMakePlansSignature(rawBody, request.headers.get('x-makeplans-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: MakePlansEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as MakePlansEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleMakePlansEvent(event));
}
