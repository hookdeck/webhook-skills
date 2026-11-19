// Generated with: employment-hero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { decodeBase64Secret, handleEvent, verifyEmploymentHeroWebhook } from '../../../lib/verify-employment-hero';

export async function POST(request: Request) {
  const secret = process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EMPLOYMENT_HERO_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!decodeBase64Secret(secret)) {
    console.error('EMPLOYMENT_HERO_WEBHOOK_SECRET is not valid base64: check the value you configured');
    return NextResponse.json({ error: 'Webhook secret is not valid base64' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyEmploymentHeroWebhook(
      rawBody,
      request.headers.get('x-employmenthero-signature'),
      request.headers.get('x-employmenthero-timestamp'),
      secret
    )) {
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
