// Generated with: hume-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { handleHumeEvent, verifyHumeSignature, type HumeEvent } from '../../../lib/hume';

export async function POST(request: NextRequest) {
  // CRITICAL: read the exact bytes Hume signed. Never request.json() first,
  // and never decode to a string and re-encode.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyHumeSignature(
      rawBody,
      request.headers.get('x-hume-ai-webhook-signature'),
      request.headers.get('x-hume-ai-webhook-timestamp'),
      process.env.HUME_WEBHOOK_SECRET
    )
  ) {
    console.error('Hume signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: HumeEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  handleHumeEvent(event);
  return new NextResponse('OK', { status: 200 });
}
