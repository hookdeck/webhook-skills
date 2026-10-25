// Generated with: moneybird-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Moneybird signs every delivery with a Moneybird-Signature header:
//   t=<unix seconds>,v1=<hex>            (one v1 per active secret during a rotation)
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook's secret as-is.
// https://developer.moneybird.com/webhooks/verifying-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',', trim each part (a space after the comma is allowed), keep t and every v1.
// Other schemes are ignored, as Moneybird asks.
function parseSignatureHeader(header: string): { t?: string; v1: string[] } {
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === undefined) t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

// Only a 64-char hex digest can match; checking first keeps Buffer.from(x, 'hex') out of the picture.
// Both sides are lowercase hex of equal length, so timingSafeEqual cannot throw.
function digestMatches(received: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  return crypto.timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected));
}

function verifyMoneybird(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0 || !/^\d+$/.test(t)) return false;

  // Moneybird recommends rejecting timestamps more than 5 minutes away. It's opt-in here: off
  // unless MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // secret used as-is, not decoded
    .update(`${t}.${rawBody}`)
    .digest('hex');
  // Accept if any v1 matches (several are sent while a secret is being rotated)
  return v1.reduce((ok, digest) => digestMatches(digest, expected) || ok, false);
}

export async function POST(request: NextRequest) {
  const secret = process.env.MONEYBIRD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MONEYBIRD_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifyMoneybird(rawBody, request.headers.get('moneybird-signature'), secret)) {
    console.error('Moneybird webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Idempotency-Key is unique per push; use it to skip a push you already processed.
  // `action` names the event; `entity` is the same JSON the API returns for that record.
  switch (event.action) {
    case 'sales_invoice_created':
      console.log(`Sales invoice ${event.entity_id} created (${event.state})`);
      break;
    case 'sales_invoice_state_changed_to_paid':
      console.log(`Sales invoice ${event.entity_id} paid`);
      break;
    case 'sales_invoice_state_changed_to_late':
      console.log(`Sales invoice ${event.entity_id} is late`);
      break;
    case 'contact_created':
      console.log(`Contact ${event.entity_id} created: ${event.entity?.company_name || event.entity?.lastname || ''}`);
      break;
    case 'contact_changed':
      console.log(`Contact ${event.entity_id} updated`);
      break;
    case 'payment_registered':
      console.log(`Payment ${event.entity_id} registered`);
      break;
    default:
      console.log(`Unhandled action: ${event.action}`);
  }

  return NextResponse.json({ received: true });
}
