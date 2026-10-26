// Generated with: sublime-security-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Sublime signs every webhook Action delivery in X-Sublime-Signature:
//   t=1626139320,v0=3d35d777...abaca06
// Each v0 value is the lowercase hex HMAC-SHA256 of "<t>.<raw body>" keyed with the Action's
// signing secret (UTF-8). The header can carry several signatures; accept any v0 match.
// https://docs.sublime.security/docs/webhooks#check-the-webhook-signature

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
// original timestamp, so a window would reject late redeliveries. Set
// SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other
// value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1626139320,v0=<hex>" -> { timestamp: '1626139320', signatures: ['<hex>'] }
function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  const parsed: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v0') parsed.signatures.push(value);
  }
  return parsed;
}

function verifySublime(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !/^\d+$/.test(timestamp) || Number(timestamp) <= 0 || signatures.length === 0) {
    return false;
  }

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the shape first.
  return signatures.some((sig) => {
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUBLIME_SECURITY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SUBLIME_SECURITY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing
  const rawBody = await request.text();

  if (!verifySublime(rawBody, request.headers.get('x-sublime-signature'), secret)) {
    console.error('Sublime Security webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // payload.id is unique per delivery: use it to drop duplicates (see webhook-handler-patterns)
  const { id, type, data = {} } = payload;
  const messageId = data.message?.id;
  const rules = (data.flagged_rules || []).map((r: { name: string }) => r.name).join(', ');

  switch (type) {
    case 'message.flagged':
      console.log(`[${id}] Message ${messageId} flagged (${data.classification}): ${rules}`);
      break;
    case 'group':
      console.log(`[${id}] Message group triggered the Action: ${rules}`);
      break;
    case 'manual':
      console.log(`[${id}] Message ${messageId} sent manually from Sublime`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }

  return NextResponse.json({ received: true });
}
