// Generated with: marqeta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import {
  verifyBasicAuth,
  verifyMarqetaSignature,
  parseAlgorithms,
  handleMarqetaNotifications,
  type MarqetaMessage,
} from '../../../lib/verify-marqeta';

export async function POST(request: Request) {
  const username = process.env.MARQETA_WEBHOOK_USERNAME;
  const password = process.env.MARQETA_WEBHOOK_PASSWORD;
  if (!username || !password) {
    console.error('MARQETA_WEBHOOK_USERNAME and MARQETA_WEBHOOK_PASSWORD must both be set: rejecting request');
    return NextResponse.json({ error: 'Webhook credentials not configured' }, { status: 500 });
  }

  if (!verifyBasicAuth(request.headers.get('authorization'), username, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Read the raw bytes first: the optional HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const secret = (process.env.MARQETA_WEBHOOK_SECRET ?? '').trim();
  if (secret) {
    const algorithms = parseAlgorithms(process.env.MARQETA_SIGNATURE_ALGORITHM);
    if (!verifyMarqetaSignature(rawBody, request.headers.get('x-marqeta-signature'), secret, algorithms)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let message: MarqetaMessage;
  try {
    message = (JSON.parse(rawBody.toString('utf8')) ?? {}) as MarqetaMessage;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (Array.isArray(message.pings)) return NextResponse.json({ received: true, ping: true });
  return NextResponse.json(handleMarqetaNotifications(message));
}
