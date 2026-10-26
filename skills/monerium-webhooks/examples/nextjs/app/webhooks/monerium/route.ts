// Generated with: monerium-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Monerium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.MONERIUM_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('MONERIUM_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Monerium signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Monerium webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every body is { type, data }: the event name is the dotted top-level `type`
  const type = event.type;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries: use it to deduplicate
  console.log(`Received Monerium webhook ${id}: ${type}`);

  switch (type) {
    case 'order.created':
      // Incoming payment detected (kind 'issue') before it is processed
      console.log('Order created:', data.id, data.kind, data.amount, data.currency, data.chain);
      break;
    case 'order.updated':
      if (data.state === 'processed') {
        // meta.txHashes holds the on-chain transaction hashes
        console.log('Order processed:', data.id, data.meta?.txHashes);
      } else if (data.state === 'rejected') {
        // meta.rejectedReason explains why
        console.error('Order rejected:', data.id, data.meta?.rejectedReason);
      } else {
        console.log('Order updated:', data.id, data.state);
      }
      break;
    case 'subscription.created':
      // Sent right after you register the webhook: answering 200 activates the subscription
      console.log('Subscription created: webhook activated');
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
