// Generated with: storekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.STOREKIT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STOREKIT_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Storekit (Svix) signed
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
    console.error('Storekit webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope is { event, data }. Two exceptions: order.refund.* put order/customer/venue/refund
  // beside `event`, and the legacy order.created sends the bare order object with no `event`
  // at all (recognised here by its order fields). Prefer order.created.v2 for new integrations.
  const type: string | undefined = event.event ?? (event.id && event.orderType && event.items ? 'order.created' : undefined);
  const data: Record<string, any> = event.data ?? {};
  // The body has no event id: `svix-id` is the stable message id (same on retries), use it to deduplicate.
  // Deliveries are not ordered: judge order state from the latest `status`, not from arrival order.
  console.log(`Received Storekit webhook ${id}: ${type}`);

  switch (type) {
    case 'order.created.v2':
    case 'order.created': {
      // order.created is the same order as the top-level body
      const order: Record<string, any> = type === 'order.created' ? event : data;
      // `actions.accept` / `actions.reject` exist only when the store has Auto-accept off
      console.log('New order:', order.id, order.code, order.orderType, order.total, order.actions ? '(awaiting accept/reject)' : '');
      break;
    }
    case 'order.accepted':
      console.log('Order accepted:', data.id, data.acceptedAt);
      break;
    case 'order.rejected':
      console.log('Order rejected:', data.id, data.rejectedAt);
      break;
    case 'order.canceled':
    case 'order.preparing':
    case 'order.ready_for_pickup':
    case 'order.out_for_delivery':
    case 'order.completed':
      // data = { order: { id, code, status }, venue }
      console.log('Order status:', type, data.order?.id, data.order?.status);
      break;
    case 'order.pos.dispatch.failed':
      console.log('POS dispatch failed:', data.order?.id, data.pos?.name, data.pos?.error, data.retryCount);
      break;
    case 'order.rating.updated':
      console.log('Order rated:', data.order?.id, data.rating, data.comments);
      break;
    case 'order.refund.created':
    case 'order.refund.succeeded':
    case 'order.refund.failed':
      // No `data` wrapper: order, customer, venue and refund sit beside `event`
      console.log('Order refund:', type, event.order?.id, event.refund?.status, event.refund?.amount);
      break;
    case 'store.opened':
      console.log('Store opened:', data.venue?.slug);
      break;
    case 'store.closed':
      // closedReason and closedUntil are empty strings when not set
      console.log('Store closed:', data.venue?.slug, data.closedReason, data.closedUntil);
      break;
    case 'store.opening_hours.updated':
      console.log('Opening hours updated:', data.venue?.slug, data.source);
      break;
    case 'item.out_of_stock':
      console.log('Item out of stock:', data.item?.name, data.reason, data.source);
      break;
    case 'payments.payout.created':
      console.log('Payout created:', data.amounts, data.estimatedArrivalDate);
      break;
    case 'bill.payment.created':
      // The docs list this event but show no payload: log what arrives
      console.log('Bill payment created:', JSON.stringify(data));
      break;
    case 'payment_link.created':
      console.log('Payment link created:', data.paymentLink?.id, data.paymentLink?.amount, data.paymentLink?.currency);
      break;
    case 'payment_link.paid':
      console.log('Payment link paid:', data.paymentLink?.id, data.payment?.transactionId, data.payment?.amount, data.payment?.currency);
      break;
    case 'payment_link.refund.created':
    case 'payment_link.refund.succeeded':
    case 'payment_link.refund.failed':
      console.log('Payment link refund:', type, data.refund?.id, data.refund?.amount, data.refund?.currency);
      break;
    case 'printer.status.offline':
    case 'printer.status.online':
      console.log('Printer status:', type, data.printer?.name, data.venue?.slug);
      break;
    default:
      // Return 200 for events you don't handle, or Storekit keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
