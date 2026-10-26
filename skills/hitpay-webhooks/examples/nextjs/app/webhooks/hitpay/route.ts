// Generated with: hitpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHitpaySignature } from '../../../lib/verify-hitpay';

/**
 * The body carries no event name. Dispatch on "{Hitpay-Event-Object}.{Hitpay-Event-Type}".
 */
function handleEvent(eventName: string, data: Record<string, any>): void {
  switch (eventName) {
    case 'charge.created':
      console.log(`Charge created: ${data.id} (${data.currency} ${data.amount}, status ${data.status})`);
      // TODO: fulfil the order, keyed on data.id (webhooks can repeat)
      return;
    case 'charge.updated':
      console.log(`Charge updated: ${data.id} (refunded ${data.refunded_amount})`);
      // TODO: record the refund / partial refund
      return;
    case 'order.created':
      console.log(`Order created: ${data.id}`);
      // TODO: create the order in your system
      return;
    case 'order.updated':
      console.log(`Order updated: ${data.id} (status ${data.status})`);
      // TODO: sync the order status
      return;
    case 'invoice.created':
      console.log(`Invoice created: ${data.id}`);
      // TODO: store the invoice
      return;
    case 'invoice.updated':
      console.log(`Invoice updated: ${data.id}`);
      // TODO: sync the invoice
      return;
    case 'payout.created':
      console.log(`Payout created: ${data.id}`);
      // TODO: reconcile the payout
      return;
    case 'transfer.created':
    case 'transfer.updated':
    case 'transfer.processing':
    case 'transfer.scheduled':
    case 'transfer.canceled':
      console.log(`${eventName}: ${data.id} (status ${data.status})`);
      // TODO: update the transfer status
      return;
    case 'transfer.paid':
      console.log(`Transfer paid: ${data.id}`);
      // TODO: mark the transfer as paid
      return;
    case 'transfer.failed':
      console.log(`Transfer failed: ${data.id}`);
      // TODO: alert finance
      return;
    default:
      console.log(`Unhandled HitPay event: ${eventName}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, whatever the content type: the signature covers exactly what was sent.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyHitpaySignature(rawBody, request.headers.get('hitpay-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing Hitpay-Signature' }, { status: 401 });
  }

  const object = request.headers.get('hitpay-event-object');
  const type = request.headers.get('hitpay-event-type');
  if (!object || !type) {
    return NextResponse.json({ error: 'Missing Hitpay-Event-Object or Hitpay-Event-Type' }, { status: 400 });
  }

  let data: unknown;
  try {
    data = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(`${object}.${type}`.toLowerCase(), data as Record<string, any>);
  } catch (err) {
    console.error('Error handling HitPay webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
