// Generated with: boldsign-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// BoldSign signs every event in X-BoldSign-Signature: "t=<unix seconds>, s0=<hex>"
// (plus ", s1=<hex>" from the old key while a secret rollover is in progress).
// Each signature is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the webhook signing secret.
// https://developers.boldsign.com/webhooks/verify-webhook-events/

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

// "t=1668693823, s0=<hex>, s1=<hex>" -> { timestamp: '1668693823', signatures: ['<hex>', '<hex>'] }
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  const parsed: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 's0' || key === 's1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyBoldSign(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  // BoldSign suggests a short window (e.g. 5 minutes). It's opt-in here: off unless
  // BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  // s0 is the current key; s1 (old key) is only present during a rollover. Accept either.
  return signatures.some((sig) => safeEqual(sig, expected));
}

export async function POST(request: NextRequest) {
  // Setup sends a "Verification" POST that must get a 200 within 10 seconds
  if (request.headers.get('x-boldsign-event') === 'Verification') {
    return new NextResponse('OK', { status: 200 });
  }

  const secret = process.env.BOLDSIGN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BOLDSIGN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing
  const rawBody = await request.text();

  if (!verifyBoldSign(rawBody, request.headers.get('x-boldsign-signature'), secret)) {
    console.error('BoldSign webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType: string | undefined = payload.event?.eventType;
  const doc = payload.data || {};

  switch (eventType) {
    case 'Verification':
      console.log('Verification event received');
      break;
    case 'Sent':
    case 'Viewed':
    case 'Signed':
      console.log(`Document ${doc.documentId} (${eventType}): ${doc.messageTitle}`);
      break;
    case 'Completed':
      console.log(`Document ${doc.documentId} completed by all signers`);
      break;
    case 'Declined':
      console.log(`Document ${doc.documentId} declined`);
      break;
    case 'Revoked':
    case 'Expired':
      console.log(`Document ${doc.documentId} ${eventType.toLowerCase()}`);
      break;
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}
