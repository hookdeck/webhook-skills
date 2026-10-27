// Generated with: chargeblast-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Chargeblast sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.CHARGEBLAST_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CHARGEBLAST_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id, timestamp, signature } = readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Chargeblast (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Chargeblast webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body has no envelope and no type field: the event type is in the X-Event-Type header
  const type = request.headers.get('x-event-type');
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Chargeblast webhook ${id}: ${type}`);

  switch (type) {
    case 'alert.created':
      // externalOrder is not set yet on alert.created; wait for alert.updated if you need it
      console.log('Alert created:', payload.id, payload.subprovider, payload.amount, payload.currency);
      break;
    case 'alert.updated':
      console.log('Alert updated:', payload.id, payload.externalOrder);
      break;
    case 'alert.refunded':
      // Can follow alert.created closely when the alert arrives already resolved
      console.log('Alert refunded:', payload.id, payload.amount, payload.currency);
      break;
    case 'alert.matched':
      console.log('Alert matched to a charge:', payload.id, payload.externalOrder);
      break;
    case 'alert.will_expire':
      // Sent at most once per alert, about 46-48 hours before it expires (Ethoca and CDRN)
      console.log('Alert will expire soon:', payload.id);
      break;
    case 'alert.within_refund_rules':
      // Not deduplicated, and a later refund can still fail: handle repeats idempotently
      console.log('Alert within refund rules:', payload.id);
      break;
    case 'deflection.created':
      // Deflection body: `type` is the product (CE or FPT), not the event type
      console.log('Deflection created:', payload.id, payload.type, payload.status);
      break;
    case 'deflection.updated':
      console.log('Deflection updated:', payload.id, payload.status, payload.fees);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
