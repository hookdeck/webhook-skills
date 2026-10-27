// Generated with: storekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Storekit (Svix) signed, whatever the content type
app.post('/webhooks/storekit', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.STOREKIT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STOREKIT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Storekit webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Envelope is { event, data }. Two exceptions: order.refund.* put order/customer/venue/refund
  // beside `event`, and the legacy order.created sends the bare order object with no `event`
  // at all (recognised here by its order fields). Prefer order.created.v2 for new integrations.
  const type = event.event ?? (event.id && event.orderType && event.items ? 'order.created' : undefined);
  const data = event.data ?? {};
  // The body has no event id: `svix-id` is the stable message id (same on retries), use it to deduplicate.
  // Deliveries are not ordered: judge order state from the latest `status`, not from arrival order.
  console.log(`Received Storekit webhook ${id}: ${type}`);

  switch (type) {
    case 'order.created.v2':
    case 'order.created': {
      // order.created is the same order as the top-level body
      const order = type === 'order.created' ? event : data;
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

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Storekit webhook server running on http://localhost:${PORT}/webhooks/storekit`);
  });
}
