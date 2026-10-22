// Generated with: mercury-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Mercury signs every delivery with a Mercury-Signature header:
//   t=<unix seconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the endpoint's secretKey as-is.
// https://docs.mercury.com/reference/webhooks#verifying-webhook-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MERCURY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MERCURY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseSignatureHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyMercury(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isInteger(ts)) return false;
  // Mercury recommends rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // MERCURY_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // secretKey used as-is, not decoded
    .update(`${t}.${rawBody}`)
    .digest('hex');
  return safeEqual(v1, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.MERCURY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MERCURY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifyMercury(rawBody, request.headers.get('mercury-signature'), secret)) {
    console.error('Mercury webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The eventTypes you subscribe to (transaction.created, ...) are not in the body.
  // The body carries resourceType + operationType ("create" | "update" | "delete").
  const key = `${event.resourceType}.${event.operationType}`;

  switch (key) {
    case 'transaction.create':
      console.log(`Transaction ${event.resourceId} created: ${event.mergePatch?.status}`);
      break;
    case 'transaction.update':
      console.log(`Transaction ${event.resourceId} updated: ${(event.changedPaths || []).join(', ')}`);
      break;
    case 'checkingAccount.update':
    case 'savingsAccount.update':
    case 'treasuryAccount.update':
    case 'creditAccount.update':
    case 'investmentAccount.update':
      console.log(`${event.resourceType} ${event.resourceId} balance updated: ${(event.changedPaths || []).join(', ')}`);
      break;
    default:
      console.log(`Unhandled event: ${key}`);
  }

  return NextResponse.json({ received: true });
}
