// Generated with: zigpoll-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Zigpoll signs every delivery with an X-Zigpoll-Signature header:
//   t=<unix milliseconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the account-wide Signing Secret.
// https://docs.zigpoll.com/integrations/webhooks

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
// original timestamp (Zigpoll's own retries are re-signed with a fresh one), so a window would
// reject late redeliveries. Set ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to
// opt in; any other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',' and trim each part. Every v1 is kept (Zigpoll sends one; accepting any match is harmless).
function parseSignatureHeader(header: string): { t?: string; v1: string[] } {
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyZigpoll(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0 || !/^\d+$/.test(t)) return false;

  // t is in milliseconds. The window is opt-in: off unless ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Date.now() / 1000 - Number(t) / 1000) > tolerance) {
    return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  );
  // Accept if any v1 matches. Check it is 64 hex chars first, then compare equal-length buffers.
  let ok = false;
  for (const candidate of v1) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    if (crypto.timingSafeEqual(Buffer.from(candidate.toLowerCase()), expected)) ok = true;
  }
  return ok;
}

export async function POST(request: NextRequest) {
  const secret = process.env.ZIGPOLL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZIGPOLL_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifyZigpoll(rawBody, request.headers.get('x-zigpoll-signature'), secret)) {
    console.error('Zigpoll webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Delivery is at-least-once: dedupe on X-Zigpoll-Delivery-Id (same across every attempt).
  const deliveryId = request.headers.get('x-zigpoll-delivery-id');

  switch (event.type) {
    case 'submitted-responses':
      // Fires on every submission, even if the respondent stops partway
      console.log(`Responses submitted for poll ${event.pollId} (complete: ${event.submissionsComplete}) [${deliveryId}]`);
      break;
    case 'completed-survey':
      // Fires once the respondent reaches the end of the survey
      console.log(`Survey completed for poll ${event.pollId} by participant ${event.participantId} [${deliveryId}]`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
