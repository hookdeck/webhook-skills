// Generated with: convox-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Convox signs every webhook once the `webhook_signing_key` Rack parameter is set:
//   Convox-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]
// v1 = HMAC-SHA256 of "<t>.<raw body>" as lowercase hex, keyed with the signing key's UTF-8
// bytes as-is (never hex-decoded, even if you generated it with `openssl rand -hex 32`).
// One v1 per active key (up to 4) during rotation: accept the delivery if ANY of them matches.
// https://docs.convox.com/console/webhook-signing

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set CONVOX_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.CONVOX_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`CONVOX_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// t is the raw string from the header (it goes into the signed message untouched); sigs is
// every v1= value. Other keys (v0, ...) are ignored.
function parseSignatureHeader(header: string): { t: string | null; sigs: string[] } {
  let t: string | null = null;
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') sigs.push(value);
  }
  return { t, sigs };
}

function verifyConvox(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, sigs } = parseSignatureHeader(signatureHeader);
  if (!t || !/^\d+$/.test(t)) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  // Check the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  const candidates = sigs.filter((sig) => /^[0-9a-fA-F]{64}$/.test(sig));
  if (candidates.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest();
  return candidates.some((sig) => crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.CONVOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CONVOX_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing, never decode and re-encode
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyConvox(rawBody, request.headers.get('convox-signature') ?? '', secret)) {
    console.error('Convox webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Delivery is best-effort and never retried; events can arrive out of order or twice.
  // Order by event.timestamp and dedupe on event.data.tick_id + event.action.
  switch (event.action) {
    case 'app:create':
      console.log(`App created: ${event.data?.app}`);
      break;
    case 'build:create':
      if (event.status === 'error') {
        console.log(`Build failed for ${event.data?.app}: ${event.data?.message}`);
      } else {
        console.log(`Build started for ${event.data?.app}`);
      }
      break;
    case 'release:promote':
      console.log(`Promote started for ${event.data?.app}`);
      break;
    case 'app:budget:cap':
      console.log(`Budget cap crossed for ${event.data?.app}`);
      break;
    case 'app:budget:auto-shutdown:fired':
      console.log(`Auto-shutdown fired for ${event.data?.app}`);
      break;
    case 'app:budget:auto-shutdown:cancelled':
      console.log(`Auto-shutdown cancelled for ${event.data?.app}: ${event.data?.cancel_reason}`);
      break;
    default:
      // The docs say to ignore unknown actions (35 documented, more may follow)
      console.log(`Unhandled action: ${event.action}`);
  }

  return NextResponse.json({ received: true });
}
