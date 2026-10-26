// Generated with: bigmailer-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// BigMailer signs every event in X-BigMailer-Signature: "t=<unix seconds>,v1=<hex>"
// (more than one v1= entry can appear, e.g. during key rotation).
// Each v1 is HMAC-SHA256 (hex) of "<t>.<raw body>" keyed with the endpoint's signing secret.
// https://docs.bigmailer.io/docs/verifying-webhook-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set BIGMAILER_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BIGMAILER_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1492774578,v1=<hex>,v1=<hex>" -> { timestamp: '1492774578', signatures: ['<hex>', '<hex>'] }
// Only v1 is a valid scheme; any other key (v0, ...) is ignored.
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  const parsed: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyBigMailer(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // The signed message is the t string exactly as sent, ".", then the raw body bytes.
  // The key is the secret's UTF-8 bytes, used as-is.
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  );
  return signatures.some((sig) => {
    // Exactly 64 hex characters, compared case-insensitively
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected);
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function POST(request: NextRequest) {
  const secret = process.env.BIGMAILER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BIGMAILER_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers exactly what BigMailer sent, so read before any JSON parsing
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyBigMailer(rawBody, request.headers.get('x-bigmailer-signature'), secret)) {
    console.error('BigMailer webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Verified, but still untrusted: check every type before reading into it.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const eventType = typeof payload.type === 'string' ? payload.type : undefined;
  // The event data sits under a key named after the type (bounce, click, ...)
  const nested = eventType ? payload[eventType] : undefined;
  const data: Record<string, unknown> = isObject(nested) ? nested : {};

  switch (eventType) {
    case 'bounce':
      // data.type is the bounce kind (hard / soft), not the event type
      console.log(`Bounce (${data.type}) for ${data.email} on campaign ${data.campaign_id}`);
      break;
    case 'click':
      console.log(`Click by ${data.email} on ${data.url}`);
      break;
    case 'complaint':
      console.log(`Complaint from ${data.email}`);
      break;
    case 'open':
      console.log(`Open by ${data.email}`);
      break;
    case 'unsubscribe': {
      const lists = Array.isArray(data.unsubscribe_ids) ? data.unsubscribe_ids.length : 0;
      console.log(`Unsubscribe by ${data.email} (all: ${data.unsubscribe_all === true}, ${lists} lists)`);
      break;
    }
    default:
      console.log(`Unhandled event: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}
