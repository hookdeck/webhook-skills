// Generated with: the-things-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyBasicAuth, handleTtsMessage, type TtsWebhookMessage } from '../../../lib/verify-the-things-stack';

export async function POST(request: Request) {
  const username = process.env.TTS_WEBHOOK_USERNAME;
  const password = process.env.TTS_WEBHOOK_PASSWORD;
  if (!username || !password) {
    console.error('TTS_WEBHOOK_USERNAME and TTS_WEBHOOK_PASSWORD must both be set: rejecting request');
    return NextResponse.json({ error: 'Webhook credentials not configured' }, { status: 500 });
  }

  if (!verifyBasicAuth(request.headers.get('authorization'), username, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // X-Downlink-Apikey (when you set a Downlink API key) can schedule downlinks: don't log it.
  const rawBody = Buffer.from(await request.arrayBuffer());
  let message: TtsWebhookMessage;
  try {
    message = JSON.parse(rawBody.toString('utf8')) as TtsWebhookMessage;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleTtsMessage(message));
}
