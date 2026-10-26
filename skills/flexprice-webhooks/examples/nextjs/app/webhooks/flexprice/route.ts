// Generated with: flexprice-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.FLEXPRICE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('FLEXPRICE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    // Self-hosted Flexprice without Svix sends no signature headers at all
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Flexprice (Svix) signed
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
    console.error('Flexprice webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `event_type`; the changed object sits under a
  // resource-named key (invoice, payment, subscription, ...), not under `data`
  const type: string = event.event_type;
  // The delivery id is stable across retries: use it to deduplicate
  console.log(`Received Flexprice webhook ${id}: ${type}`);

  switch (type) {
    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted':
      console.log(`Customer ${type.split('.')[1]}:`, event.customer?.id);
      break;
    case 'subscription.created':
      console.log('Subscription created:', event.subscription?.id);
      break;
    case 'subscription.activated':
      console.log('Subscription activated:', event.subscription?.id);
      break;
    case 'subscription.updated':
      console.log('Subscription updated:', event.subscription?.id);
      break;
    case 'subscription.plan_changed':
      console.log('Subscription plan changed:', event.subscription?.id);
      break;
    case 'subscription.cancelled':
      console.log('Subscription cancelled:', event.subscription?.id);
      break;
    case 'invoice.update.finalized':
      console.log('Invoice finalized:', event.invoice?.id, event.invoice?.amount_due, event.invoice?.currency);
      break;
    case 'invoice.update.payment':
      // Read the status from the payload, not the event name: messages can arrive out of order
      console.log('Invoice payment status changed:', event.invoice?.id, event.invoice?.payment_status);
      break;
    case 'invoice.update.voided':
      console.log('Invoice voided:', event.invoice?.id);
      break;
    case 'invoice.payment.overdue':
      console.log('Invoice overdue:', event.invoice?.id);
      break;
    case 'payment.success':
      console.log('Payment succeeded:', event.payment?.id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.payment?.id);
      break;
    case 'wallet.credit_balance.dropped':
      console.log('Wallet credit balance dropped:', event.wallet?.id);
      break;
    case 'checkout.session.completed':
      console.log('Checkout session completed');
      break;
    case 'event.rejected':
      // A usage event matched no meter and was dropped
      console.log('Usage event rejected');
      break;
    default:
      // Return 200 for events you don't handle, or Flexprice keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
