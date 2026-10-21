// Generated with: zoominfo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ZoomInfo does not sign payloads. It sends a verification token, generated
// when you create the webhook, back in the x-zoominfo-token header.
// https://tech-docs-library.zoominfo.com/webhooks-implementation-guide.pdf
function verifyZoomInfoToken(tokenHeader: string | null, expectedToken: string | undefined): boolean {
  if (!tokenHeader || !expectedToken) {
    return false;
  }

  // Constant-time compare; timingSafeEqual throws on length mismatch
  const received = Buffer.from(tokenHeader);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  // Read the raw body as text; never rely on parsed JSON for verification
  const rawBody = await request.text();
  const expectedToken = process.env.ZOOMINFO_WEBHOOK_TOKEN;

  // The "Validate" button in ZoomInfo posts a sample payload before any token
  // exists. With no token configured we acknowledge it but do not process it.
  if (!expectedToken) {
    console.warn('ZOOMINFO_WEBHOOK_TOKEN is not set: acknowledging without processing');
    return NextResponse.json({ received: true, verified: false });
  }

  if (!verifyZoomInfoToken(request.headers.get('x-zoominfo-token'), expectedToken)) {
    console.error('ZoomInfo webhook token verification failed');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Subscriptions are an object type (Contact or Company) plus the Update
  // event. The guide does not define a payload field naming the event, so
  // route on your own subscription/endpoint and read the record fields you
  // need from the payload (up to 25 profiles per delivery).
  const keys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  console.log(`✓ Verified ZoomInfo webhook (${rawBody.length} chars, keys: ${keys.join(', ') || 'none'})`);

  return NextResponse.json({ received: true, verified: true });
}
