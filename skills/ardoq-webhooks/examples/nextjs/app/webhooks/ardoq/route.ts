// Generated with: ardoq-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { handleArdoqEvent, verifyArdoqSignature, type ArdoqEvent } from '../../../lib/ardoq';

export async function POST(request: NextRequest) {
  // CRITICAL: read the exact bytes Ardoq signed. Never request.json() first,
  // and never decode to a string and re-encode.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyArdoqSignature(
      rawBody,
      request.headers.get('x-ardoq-signature-256'),
      request.headers.get('x-ardoq-timestamp'),
      process.env.ARDOQ_WEBHOOK_SECRET
    )
  ) {
    console.error('Ardoq signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: ArdoqEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  handleArdoqEvent(event);
  return new NextResponse('OK', { status: 200 });
}
