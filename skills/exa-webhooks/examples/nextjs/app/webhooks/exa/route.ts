// Generated with: exa-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Exa-Signature: "t=<unix seconds>,v1=<hex>[,v1=<hex>...]"
// v1 = HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook secret (UTF-8 string).
// https://docs.exa.ai/websets/api/webhooks/verifying-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set EXA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.EXA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`EXA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
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

// The header may carry several v1 values (e.g. during secret rotation)
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  return { timestamp, signatures };
}

function verifyExa(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return signatures.some((sig) => safeEqual(sig, expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.EXA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EXA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('exa-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing Exa-Signature header' }, { status: 400 });
  }

  // Raw body: read as text before any JSON parsing
  const rawBody = await request.text();

  if (!verifyExa(rawBody, signatureHeader, secret)) {
    console.error('Exa webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Exa events: { id, object: "event", type, data, createdAt }
  switch (event.type) {
    case 'webset.created':
      console.log(`Webset created: ${event.data?.id}`);
      break;
    case 'webset.idle':
      console.log(`Webset idle: ${event.data?.id}`);
      break;
    case 'webset.search.completed':
      console.log(`Search completed: ${event.data?.id}`);
      break;
    case 'webset.item.created':
      console.log(`Item created: ${event.data?.id}`);
      break;
    case 'webset.item.enriched':
      console.log(`Item enriched: ${event.data?.id}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
