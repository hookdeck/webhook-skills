// Generated with: jamie-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Jamie signs every webhook created with "Signature Verification":
//   x-jamie-signature: t=<unix seconds>,v0=<lowercase hex>
// v0 = HMAC-SHA256 of "<t>.<raw body>", keyed with the signing secret string's UTF-8 bytes as-is.
// https://docs.meetjamie.ai/developers/webhooks/security-verification

// Optional replay window in seconds, off by default (0). Jamie's docs recommend rejecting
// timestamps older than 5 minutes (300) when Jamie calls you directly; set
// JAMIE_TIMESTAMP_TOLERANCE_SECONDS=300 to opt in. Behind Hookdeck leave it at 0: Hookdeck
// retries and replays resend the original timestamp, so a window rejects late redeliveries.
// An invalid value leaves the check off, with a warning.
const DEFAULT_TOLERANCE_SECONDS = 0;
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`JAMIE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return DEFAULT_TOLERANCE_SECONDS;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// "t=1234567890,v0=abc" -> { t: '1234567890', v0: ['abc'] } (any number of v0 entries)
function parseSignatureHeader(header: string): { t?: string; v0: string[] } {
  const parsed: { t?: string; v0: string[] } = { v0: [] };
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') parsed.t = value;
    else if (key === 'v0') parsed.v0.push(value);
  }
  return parsed;
}

function verifyJamie(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v0 } = parseSignatureHeader(signatureHeader);
  if (!t || v0.length === 0 || !/^\d+$/.test(t)) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  return v0.some((sig) => safeEqual(sig, expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.JAMIE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('JAMIE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing (works for any Content-Type)
  const rawBody = await request.text();

  const signature = request.headers.get('x-jamie-signature');
  if (!signature || !verifyJamie(rawBody, signature, secret)) {
    console.error('Jamie webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in metadata.event (and the jamie-event header).
  // Dedupe on metadata.id / the jamie-delivery header: retries can deliver duplicates.
  const type = event.metadata?.event ?? request.headers.get('jamie-event');
  switch (type) {
    case 'meeting.completed':
      console.log(`Meeting completed: ${event.data?.title}`);
      console.log(`Summary: ${event.data?.summary?.short}`);
      console.log(`Tasks: ${event.data?.tasks?.length ?? 0}`);
      break;
    default:
      console.log(`Unhandled event: ${type}`);
  }

  return NextResponse.json({ received: true });
}
