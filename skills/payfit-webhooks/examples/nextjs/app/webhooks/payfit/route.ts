// Generated with: payfit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import {
  decodeSigningSecret,
  verifyPayfitWebhook,
  handlePayfitEvent,
  type PayfitEvent,
} from '../../../lib/verify-payfit';

export async function POST(request: Request) {
  const secret = process.env.PAYFIT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYFIT_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!decodeSigningSecret(secret)) {
    console.error('PAYFIT_WEBHOOK_SECRET is not a valid whsec_ base64 secret: check the value you configured');
    return NextResponse.json({ error: 'Webhook secret is not valid base64' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const headers = {
    'svix-id': request.headers.get('svix-id'),
    'svix-timestamp': request.headers.get('svix-timestamp'),
    'svix-signature': request.headers.get('svix-signature'),
  };
  const tolerance = process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS;
  if (!verifyPayfitWebhook(rawBody, headers, secret, tolerance ? Number(tolerance) : null)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: PayfitEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as PayfitEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handlePayfitEvent(event));
}
