// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWhatnotSignature,
  processedEvents,
  type Money,
  type WhatnotEvent,
  type WhatnotOrder,
} from '../../../lib/whatnot';

// HMAC verification uses Node's crypto module.
export const runtime = 'nodejs';

function formatMoney(money?: Money | null) {
  return money ? `${money.amount} ${money.currency}` : 'n/a';
}

function handleOrder(topic: string, order: WhatnotOrder) {
  console.log(`${topic}: order ${order.order_id}, total ${formatMoney(order.total)}`);
  if (order.cancelled_at) {
    console.log(`Order ${order.order_id} cancelled at ${order.cancelled_at}`);
  }
  // shipping_address and tracking_info are only populated for apps with the
  // read_customers scope. Otherwise they're null or missing.
  if (order.shipping_address) {
    console.log(`Ship to ${order.shipping_address.city}, ${order.shipping_address.country}`);
  }
  if (order.tracking_info) {
    console.log(`Tracking ${order.tracking_info.courier} ${order.tracking_info.tracking_code}`);
  }
}

function handleEvent(event: WhatnotEvent, sellerId: string | null) {
  const obj = event.object ?? {};

  switch (event.topic) {
    case 'product/sold':
      // Decrement stock in your own system for product_id / variant_id.
      console.log(`Product ${obj.product_id} sold (qty ${obj.quantity}), order ${obj.order_id}`);
      break;
    case 'bulk_operation/finished':
      console.log(`Bulk operation ${obj.id} finished with status ${obj.status}`);
      break;
    case 'listing/created':
    case 'listing/updated':
      console.log(`${event.topic}: listing ${obj.listing_id} (${obj.transaction_type}, ${obj.listing_status})`);
      break;
    case 'order/created':
    case 'order/updated':
      handleOrder(event.topic, obj as WhatnotOrder);
      break;
    case 'livestream/created':
      console.log(`Livestream ${obj.livestream_id} created: ${obj.title}`);
      break;
    case 'livestream/stopped':
      // Fires when a livestream ends OR is cancelled.
      console.log(`Livestream ${obj.livestream_id} stopped`);
      break;
    case 'livestream/product_added':
    case 'livestream/product_removed':
      console.log(`${event.topic}: listing ${obj.listing_id} in livestream ${obj.livestream_id}`);
      break;
    case 'shipment/label_created':
      // BETA topic: Whatnot says it may change without notice.
      // label_url needs the read_customers scope.
      console.log(`Shipment ${obj.shipment_id} label (${obj.reason}): ${obj.courier} ${obj.tracking_code}`);
      break;
    default:
      // Whatnot is in development preview and may add topics. Acknowledge
      // unknown ones with 200: an error would only trigger 5 retries.
      console.log(`Unhandled Whatnot topic: ${event.topic}`);
  }

  if (sellerId) console.log(`(seller ${sellerId})`);
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHATNOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHATNOT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-whatnot-webhook-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Whatnot-Webhook-Signature header' }, { status: 400 });
  }

  // Raw bytes — never request.json() before verifying; the HMAC is computed
  // over the exact bytes Whatnot sent.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyWhatnotSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: WhatnotEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // X-Whatnot-Seller-Id tells a multi-seller app which seller this is for.
  handleEvent(event, request.headers.get('x-whatnot-seller-id'));
  processedEvents.add(event.id);

  // Whatnot expects exactly 200 OK. Anything else is retried.
  return NextResponse.json({ received: true });
}
