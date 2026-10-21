// Generated with: gopuff-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set GOPUFF_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.GOPUFF_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`GOPUFF_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Svix-signed delivery (the Standard Webhooks scheme) and throw if it's invalid.
 *
 * Written out rather than calling the `svix` SDK, because the SDK always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * svix-timestamp, so that window would reject them. Here the window is opt-in via
 * GOPUFF_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifySvixSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | null | undefined>,
  secret: string,
  toleranceSeconds: number = timestampToleranceSeconds()
): void {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing Svix signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid svix-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // Key = base64-decoded secret after the whsec_ prefix
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

// Gopuff payloads carry no event-type field, so classify them by shape.
// order.status / order.status.v2 / order.delivered -> { order: {...} }
// Delivery Status -> { driver: {...} }; Delivery ETA -> { expected_delivery_time: {...} }
function classify(event: any): string {
  if (event?.order && typeof event.order === 'object') return 'order';
  if (event?.driver) return 'delivery_status';
  if (event?.expected_delivery_time) return 'delivery_eta';
  return 'unknown';
}

export async function POST(request: Request) {
  const secret = process.env.GOPUFF_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Svix sends svix-* headers; white-labeled accounts use webhook-*.
  const id = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const timestamp = request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const signature = request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body. Do not JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // Signed content is `${id}.${timestamp}.${rawBody}`; every v1 signature is checked in
    // constant time. The timestamp window is opt-in (GOPUFF_TIMESTAMP_TOLERANCE_SECONDS).
    verifySvixSignature(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /outside tolerance/i.test(msg) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // svix-id is stable across retries: use it as the idempotency key.
  const kind = classify(event);
  switch (kind) {
    case 'order': {
      const { id: orderId, partner_order_id: partnerOrderId, status, cancel_reason: reason } = event.order;
      console.log('Order status (order.status.v2):', { orderId, partnerOrderId, status });
      if (status === 'Finished') console.log('Order delivered (order.delivered):', partnerOrderId);
      if (status === 'Cancelled') console.log('Order cancelled:', reason);
      break;
    }
    case 'delivery_status':
      console.log('Driver location:', event.driver?.location);
      break;
    case 'delivery_eta':
      console.log('Delivery ETA:', event.expected_delivery_time);
      break;
    default:
      console.log('Unhandled Gopuff payload');
  }

  return NextResponse.json({ success: true, kind, svixId: id }, { status: 200 });
}
