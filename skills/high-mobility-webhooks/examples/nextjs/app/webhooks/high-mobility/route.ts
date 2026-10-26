// Generated with: high-mobility-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// High Mobility signs every delivery:
//   X-HM-Signature-256: sha256=<lowercase hex>
// = HMAC-SHA256 of the raw body bytes only, keyed with the webhook secret's UTF-8 bytes as-is.
// The deprecated X-HM-Signature (HMAC-SHA1) is ignored.
// https://docs.high-mobility.com/docs/webhooks

function verifyHighMobility(rawBody: Buffer, header: string | null, secret: string): boolean {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (/^sha256=/i.test(sig)) sig = sig.slice('sha256='.length); // bare digest is accepted too
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false; // validate before comparing
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  );
  const received = Buffer.from(sig.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

async function handleHighMobility(request: NextRequest) {
  const secret = process.env.HIGH_MOBILITY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HIGH_MOBILITY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, read before any parsing (a request with no body gives zero bytes)
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyHighMobility(rawBody, request.headers.get('x-hm-signature-256'), secret)) {
    console.error('High Mobility webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verified and empty (e.g. a GET): acknowledge.
  if (rawBody.length === 0) return NextResponse.json({ received: true });

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(body)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Everything in the body is untrusted: check each nested value's type before reading it.
  // Duplicates and out-of-order deliveries are possible, so keep handlers idempotent.
  const event = isObject(body.event) ? body.event : {};
  const vehicle = isObject(body.vehicle) ? body.vehicle : {};
  const type = str(event.type);

  switch (type) {
    case 'fleet_clearance_changed':
      console.log(`Fleet clearance changed for ${str(vehicle.vin)}: ${str(event.action)} ${str(event.detail) ?? ''}`.trim());
      break;
    case 'ping':
      console.log('Ping received (webhook configuration changed)');
      break;
    default:
      console.log(`Unhandled event: ${type}`);
  }

  return NextResponse.json({ received: true });
}

// High Mobility's docs don't name the HTTP method, so handle all of these.
export const GET = handleHighMobility;
export const POST = handleHighMobility;
export const PUT = handleHighMobility;
export const PATCH = handleHighMobility;
export const DELETE = handleHighMobility;
