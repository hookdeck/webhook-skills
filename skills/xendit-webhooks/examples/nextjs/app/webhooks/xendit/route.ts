// Generated with: xendit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyXenditToken } from '../../../lib/verify-xendit';

/**
 * Payload shape varies by product:
 *  - Payments API webhooks have an "event" field and the resource under "data".
 *  - Invoice callbacks have no "event": the invoice is the body, with a "status"
 *    such as PAID or EXPIRED.
 */
interface XenditPayload {
  event?: string;
  data?: Record<string, any>;
  status?: string;
  id?: string;
  external_id?: string;
}

function handleEvent(payload: XenditPayload): void {
  const { event } = payload;
  const data = payload.data ?? {};

  switch (event) {
    case 'payment.capture':
      console.log(`Payment captured: ${data.payment_id} (${data.currency} ${data.request_amount})`);
      // TODO: fulfil the order, keyed on data.payment_id (webhooks can repeat)
      return;

    case 'payment.authorization':
      console.log(`Payment authorized: ${data.payment_id}`);
      // TODO: capture the payment or hold the order
      return;

    case 'payment.failure':
      console.log(`Payment failed: ${data.payment_id} (${data.failure_code})`);
      // TODO: release stock, tell the customer
      return;

    case 'payment.expiry':
      console.log(`Payment authorization expired: ${data.payment_id}`);
      // TODO: release the reserved funds in your records
      return;

    case 'payment_request.expiry':
      console.log(`Payment request expired: ${data.payment_request_id || data.id}`);
      // TODO: cancel the pending order
      return;

    case 'payment_token.activation':
      console.log(`Payment token activated: ${data.payment_token_id}`);
      // TODO: store the token for future charges
      return;

    case 'payment_token.failure':
      console.log(`Payment token failed: ${data.payment_token_id}`);
      // TODO: ask the customer to link a payment method again
      return;

    case 'payment_token.expiry':
      console.log(`Payment token expired: ${data.payment_token_id}`);
      // TODO: remove the stored token
      return;

    case 'refund.succeeded':
      console.log(`Refund succeeded: ${data.id}`);
      // TODO: mark the refund as completed
      return;

    case 'refund.failed':
      console.log(`Refund failed: ${data.id}`);
      // TODO: alert support
      return;
  }

  if (!event && payload.status) {
    // Invoice callback (no "event" field)
    if (payload.status === 'PAID') {
      console.log(`Invoice paid: ${payload.external_id || payload.id}`);
      // TODO: mark the order as paid
      return;
    }
    if (payload.status === 'EXPIRED') {
      console.log(`Invoice expired: ${payload.external_id || payload.id}`);
      // TODO: cancel the order
      return;
    }
  }

  console.log(`Unhandled Xendit webhook: ${event || payload.status}`);
}

export async function POST(request: NextRequest) {
  // Check the token before reading or parsing the body.
  if (!verifyXenditToken(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-callback-token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as XenditPayload);
  } catch (err) {
    console.error('Error handling Xendit webhook:', err);
    // A non-2xx makes Xendit retry (up to 6 times over 24 hours).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
