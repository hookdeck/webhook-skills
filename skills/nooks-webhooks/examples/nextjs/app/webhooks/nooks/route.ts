// Generated with: nooks-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Nooks signs every delivery after activation with an x-webhook-signature header:
//   t=<unix milliseconds>,s=<base64>
// s is the base64 HMAC-SHA256 of "<t>.<raw body>" (t exactly as sent), keyed with the signing key
// as a UTF-8 string.
// https://nooks.help.usepylon.com/articles/8109690071-nooks-webhooks-integration-guide

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set NOOKS_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`NOOKS_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Split on ',' then on the FIRST '=' only: base64 signatures end in '='.
function parseSignatureHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyNooks(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, s } = parseSignatureHeader(signatureHeader);
  if (!t || !s || !/^\d+$/.test(t)) return false;

  // Nooks recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // NOOKS_TIMESTAMP_TOLERANCE_SECONDS > 0. t is in milliseconds.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Date.now() - Number(t)) / 1000 > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // signing key used as-is, as UTF-8
    .update(`${t}.${rawBody}`)
    .digest('base64');
  return safeEqual(s, expected);
}

export async function POST(request: NextRequest) {
  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature');

  // The one-time activation ping Nooks sends when you save the URL may be unsigned, and it must get
  // a 2xx. Unsigned requests are rejected unless NOOKS_ACCEPT_UNSIGNED_PING=true, which you set only
  // while activating a URL that points straight at this app (no signing key exists yet). Even then
  // they are acknowledged, never processed.
  if (!signature) {
    if (process.env.NOOKS_ACCEPT_UNSIGNED_PING === 'true') {
      console.log('Unsigned request acknowledged (activation ping); not processed');
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: 'Missing x-webhook-signature header' }, { status: 401 });
  }

  const secret = process.env.NOOKS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('NOOKS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  if (!verifyNooks(rawBody, signature, secret)) {
    console.error('Nooks webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event?.event;
  switch (eventType) {
    case 'call.logged': {
      // De-duplicate on callData.callId (stable across retries), never on eventId (one per attempt)
      const call = event.callData || {};
      console.log(`Call ${call.callId} logged: ${call.status}, disposition ${call.disposition?.name}`);
      break;
    }
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}
