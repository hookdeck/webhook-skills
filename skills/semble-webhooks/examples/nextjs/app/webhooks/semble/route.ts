// Generated with: semble-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Semble signs every delivery with an X-Webhook-Signature header:
//   t=<unix seconds>,v1=<lowercase hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the webhook secret as a UTF-8 string.
// Semble's docs show one v1; accepting any matching v1 is a harmless defensive choice.
// X-Webhook-Timestamp repeats t, but the t inside X-Webhook-Signature is the one to sign with.
// https://docs.semble.io/docs/webhooks/guide/

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set SEMBLE_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.SEMBLE_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SEMBLE_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',', trim each part (a space after the comma is allowed), split at the first '='.
// Returns the timestamp and every v1 value.
function parseSignatureHeader(header: string): { t?: string; v1: string[] } {
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const kv = part.trim();
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifySemble(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0 || !/^\d+$/.test(t)) return false;

  // Semble's guide suggests rejecting timestamps older than 5 minutes. It's opt-in here: off unless
  // SEMBLE_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // secret used as a UTF-8 string, not decoded
    .update(`${t}.${rawBody}`)
    .digest('hex');

  // Accept if any v1 matches. Compare the lowercase hex strings as equal-length buffers; the
  // 64-hex check rejects malformed values before they reach the comparison.
  return v1.some((sig) => /^[0-9a-f]{64}$/i.test(sig) && safeEqual(sig.toLowerCase(), expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.SEMBLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SEMBLE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifySemble(rawBody, request.headers.get('x-webhook-signature'), secret)) {
    console.error('Semble webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Body: { subscriptionId, eventId, eventType, identifiers, metadata? }
  const ids = event.identifiers || {};

  switch (event.eventType) {
    case 'booking.created':
      console.log(`Booking ${ids.bookingId} created (patient ${ids.patientId ?? 'none'})`);
      break;
    case 'booking.updated':
      console.log(`Booking ${ids.bookingId} updated`);
      break;
    case 'booking.deleted':
      console.log(`Booking ${ids.bookingId} deleted`);
      break;
    case 'contact.created':
      console.log(`Contact ${ids.contactId} created`);
      break;
    case 'invoice.paid':
      console.log(`Invoice ${ids.invoiceId} paid by payment ${ids.paymentId}`);
      break;
    case 'resourceAvailability.updated':
      console.log(`Availability rule ${ids.resourceAvailabilityId} updated`);
      break;
    default:
      console.log(`Unhandled event: ${event.eventType}`);
  }

  return NextResponse.json({ received: true });
}
