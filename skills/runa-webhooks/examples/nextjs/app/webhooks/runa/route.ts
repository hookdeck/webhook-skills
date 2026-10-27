// Generated with: runa-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// product.update events can arrive out of order: keep the newest timestamp per product
// (in-memory for the example; use your database in production)
const lastProductUpdate = new Map<string, number>();

// Runa bodies are bare resources with no event-type field. Each Svix endpoint subscribes to a
// single event type, so identify the event from the payload shape.
function detectEvent(payload: any): 'order.completion' | 'product.update' | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('product_code' in payload && 'new_state' in payload) return 'product.update';
  if (payload.status === 'COMPLETED' || payload.status === 'FAILED') return 'order.completion';
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.RUNA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('RUNA_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Runa (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
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
    console.error('Runa webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = detectEvent(payload);
  let ignored: string | undefined;

  switch (event) {
    case 'order.completion':
      // The `status` field says which of the two payloads this is
      if (payload.status === 'COMPLETED') {
        // Full order summary: safe to fulfil after reconciling with the Orders API
        console.log('Order completed:', payload.id, payload.completed_at, payload.currency, payload.total_price);
      } else {
        // Failed orders carry only { id, status: 'FAILED' }: look the order up for details
        console.log('Order failed:', payload.id);
      }
      break;
    case 'product.update': {
      // Delivery order isn't guaranteed: discard events older than the last one seen
      const sentAt = Date.parse(payload.timestamp);
      const last = lastProductUpdate.get(payload.product_code);
      if (!Number.isNaN(sentAt) && last !== undefined && sentAt < last) {
        console.log('Ignoring stale product update:', payload.product_code, payload.timestamp);
        ignored = 'stale';
        break;
      }
      if (!Number.isNaN(sentAt)) lastProductUpdate.set(payload.product_code, sentAt);
      const before: Record<string, any> = payload.old_state ?? {};
      const after: Record<string, any> = payload.new_state ?? {};
      if (before.is_orderable !== after.is_orderable) {
        // false: disable the product (orders for it are rejected); true: enable it again
        console.log('Product orderability changed:', payload.product_code, after.is_orderable);
      }
      if (before.price_multiplier !== after.price_multiplier) {
        console.log('Product price multiplier changed:', payload.product_code, after.price_multiplier);
      }
      break;
    }
    default:
      // Return 200 for payloads you don't handle, or Svix keeps retrying them
      console.log('Unhandled Runa payload');
  }

  return NextResponse.json({ received: true, event, ...(ignored && { ignored }) });
}
