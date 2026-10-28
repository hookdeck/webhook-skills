// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWhatnotWebhook,
  processedWebhookIds,
  type Money,
  type SignatureHeaders,
  type WhatnotEvent,
  type WhatnotOrder,
} from '../../../lib/whatnot';

function formatMoney(money?: Money | null) {
  return money ? `${money.amount} ${money.currency}` : 'n/a';
}

function handleEvent(event: WhatnotEvent) {
  const { type, data = {}, seller_id: sellerId } = event;

  switch (type) {
    // --- Orders (read:orders) ----------------------------------------------
    case 'orders.created':
    case 'orders.updated': {
      // No ordering guarantee: orders.updated can arrive before orders.created.
      // Compare order.updated_at with what you stored before overwriting.
      const order = data as WhatnotOrder;
      console.log(`${type}: order ${order.id} (${order.status}), total ${formatMoney(order.amounts?.total)}`);
      if (order.cancelled_at) console.log(`Order ${order.id} cancelled at ${order.cancelled_at}`);
      // buyer is null unless your app holds read:customers.
      if (order.buyer) console.log(`Buyer ${order.buyer.username}`);
      break;
    }

    // --- Shows (read:shows) ------------------------------------------------
    case 'shows.created': // excludes rehearsals
    case 'shows.updated': // fires even when only updated_at changed
      console.log(`${type}: show ${data.id} "${data.title}" (${data.status})`);
      break;
    case 'shows.started': // also fires when a stopped show resumes
    case 'shows.ended': // includes Whatnot ending an abandoned show
    case 'shows.cancelled':
      console.log(`${type}: show ${data.show_id}`);
      break;

    // --- Merchandising (read:merchandising) --------------------------------
    case 'merchandising.products.added_to_show':
    case 'merchandising.products.removed_from_show': // also fires when the listing was deleted
      console.log(`${type}: product ${data.product_id} in show ${data.show_id}`);
      break;

    // --- Shipments (read:shipments) ----------------------------------------
    case 'shipments.created':
      // recipient, destination_address and documents need read:customers.
      console.log(`Shipment ${data.id} created (${data.status})`);
      if (data.recipient) console.log(`Recipient ${data.recipient.username}`);
      break;
    case 'shipments.label_generated':
      // documents is null without read:customers and customer-address access.
      console.log(`Shipment ${data.shipment_id} label ${data.reason}: ${data.tracking?.carrier} ${data.tracking?.tracking_code}`);
      if (data.documents?.label_url) console.log(`Label: ${data.documents.label_url}`);
      break;
    case 'shipments.tracking_code_added':
      console.log(`Shipment ${data.shipment_id} tracking: ${data.tracking?.carrier} ${data.tracking?.tracking_code}`);
      break;
    case 'shipments.parcel_updated':
      console.log(`Shipment ${data.shipment_id} parcel updated`);
      break;
    case 'shipments.items.added':
    case 'shipments.items.removed':
      // shipment_item_ids lists every item on the shipment after the change.
      console.log(`${type}: shipment ${data.shipment_id} now has ${data.shipment_item_ids?.length ?? 0} items`);
      break;

    // --- Products (read:inventory) -----------------------------------------
    case 'products.created':
    case 'products.updated': // doesn't say which fields changed
      console.log(`${type}: product ${data.id} "${data.title}"`);
      break;
    case 'products.deleted':
      console.log(`Product ${data.id} deleted`);
      break;

    default:
      // Whatnot adds topics over time: acknowledge, don't fail (an error is retried).
      console.log(`Unhandled Whatnot event type: ${type}`);
  }

  // seller_id is in the signed body; multi-seller apps route on it.
  console.log(`(seller ${sellerId})`);
}

export async function POST(request: NextRequest) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.WHATNOT_WEBHOOK_SECRET) {
    console.error('WHATNOT_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = {
    'webhook-id': request.headers.get('webhook-id'),
    'webhook-timestamp': request.headers.get('webhook-timestamp'),
    'webhook-signature': request.headers.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json(
      { error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' },
      { status: 400 }
    );
  }

  // Raw body: request.json() would re-serialise Whatnot's space-separated
  // JSON and break the HMAC.
  const rawBody = await request.text();

  let event: WhatnotEvent;
  try {
    event = verifyWhatnotWebhook(rawBody, headers as SignatureHeaders);
  } catch (err) {
    console.error('Whatnot webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse webhook-id; acknowledge duplicates with a 2xx.
  const webhookId = headers['webhook-id'];
  if (processedWebhookIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Whatnot times out after 5 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedWebhookIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Whatnot event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Any 2xx counts as delivered.
  return NextResponse.json({ received: true });
}
