// Generated with: terra-api-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Terra signs every delivery in the terra-signature header:
//   t=<unix seconds>,v1=<hex>[,v0=<hex>]
// v1 is HMAC-SHA256 (lowercase hex) of "<t>.<raw body>", keyed with the destination's signing secret
// (UTF-8 bytes, used as-is). The header can carry several v1 values; any match is enough. Ignore v0.
// https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations/webhooks

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set TERRA_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.TERRA_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`TERRA_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1723808700,v1=<hex>,v0=<hex>" -> { timestamp: '1723808700', signatures: ['<hex>'] }
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  const parsed: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't' && parsed.timestamp === undefined) parsed.timestamp = value;
    else if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyTerra(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  // Opt-in only: off unless TERRA_WEBHOOK_TOLERANCE_SECONDS > 0
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // The signed message is bytes: the t string exactly as sent, ".", then the untouched body bytes.
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  );

  return signatures.some((sig) => {
    // Validate length and alphabet before comparing; never Buffer.from(sig, 'hex') unvalidated input
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected);
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.TERRA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TERRA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, not request.json(): the signature covers the exact body Terra sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyTerra(rawBody, request.headers.get('terra-signature'), secret)) {
    console.error('Terra webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const user = payload.user || {};

  // The event type is the top-level "type" field; "status" qualifies it.
  switch (payload.type) {
    case 'auth':
      console.log(`User ${user.user_id} connected ${user.provider} (status: ${payload.status})`);
      break;
    case 'deauth':
    case 'access_revoked':
      console.log(`User ${user.user_id} disconnected (${payload.type})`);
      break;
    case 'user_reauth':
      console.log(`User ${user.user_id} re-authenticated`);
      break;
    case 'connection_error':
      console.error(`Connection error for user ${user.user_id}: ${payload.status}`);
      break;
    case 'activity':
    case 'sleep':
    case 'body':
    case 'daily':
    case 'athlete':
      console.log(`${payload.type} data for user ${user.user_id}: ${(payload.data || []).length} record(s)`);
      break;
    default:
      console.log(`Unhandled event: ${payload.type}`);
  }

  return NextResponse.json({ received: true });
}
