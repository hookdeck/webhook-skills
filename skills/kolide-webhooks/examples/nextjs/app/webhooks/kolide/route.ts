// Generated with: kolide-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 1Password Device Trust (Kolide) sends the signature in the Authorization header as a BARE
// lowercase hex digest: no "Bearer", no prefix, no timestamp.
//   Authorization: hex( HMAC-SHA256( endpoint secret as UTF-8 bytes, raw request body ) )
// Only the body is signed, so there is no replay window to check.
// https://support.1password.com/device-trust-webhooks/

// Hex is case-insensitive (Hookdeck's source compares it that way too). Check the format
// first: Buffer.from(x, 'hex') silently drops bad characters.
function verifyKolide(rawBody: Buffer, authorization: string | null, secret: string): boolean {
  if (!secret || authorization === null) return false;
  const received = authorization.trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = crypto
    .createHmac('sha256', secret) // secret string used as-is: UTF-8 bytes, not hex/base64 decoded
    .update(rawBody) // raw bytes exactly as received
    .digest(); // 32 bytes

  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// Parsed JSON is untrusted: only read fields after checking their type.
type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObject(v) ? v : {});
const text = (v: unknown): string | undefined =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;

export async function POST(request: NextRequest) {
  const secret = process.env.KOLIDE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('KOLIDE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers the exact body Kolide sent, whatever the Content-Type.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyKolide(rawBody, request.headers.get('authorization'), secret)) {
    console.error('Kolide webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event) || typeof event.event !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Envelope: { event, id, timestamp, data }. Dispatch on `event`; dedupe on `id`.
  const data = obj(event.data);
  switch (event.event) {
    case 'webhook.test':
      console.log('Test webhook received');
      break;
    case 'devices.created':
      console.log(`Device created: ${text(data.device_name)} (id ${text(data.device_id)})`);
      break;
    case 'devices.registered': {
      const owner = obj(data.registered_owner);
      console.log(`Device registered: ${text(data.device_name)} by ${text(owner.email)}`);
      break;
    }
    case 'devices.destroyed':
      console.log(`Device destroyed: ${text(data.device_name)} (id ${text(data.device_id)})`);
      break;
    case 'device_trust.status_changed':
      console.log(`Device ${text(data.device_name)} is now ${text(data.device_status)}`);
      break;
    case 'issues.new':
    case 'issues.resolved': {
      const device = obj(data.device);
      const check = obj(data.check);
      console.log(`${event.event}: ${text(check.name)} on ${text(device.name)}`);
      break;
    }
    case 'auth_logs.success':
    case 'auth_logs.failure':
      console.log(`${event.event}: ${text(data.device_name)} via ${text(data.browser_name)}`);
      break;
    case 'audit_log.recorded':
      console.log(`Audit log: ${text(data.actor_name)}: ${text(data.description)}`);
      break;
    default:
      // admin_users.created, requests.issue_exemption, requests.registration, ...
      console.log(`Unhandled event: ${event.event}`);
  }

  return NextResponse.json({ received: true });
}
