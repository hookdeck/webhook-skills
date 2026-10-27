// Generated with: cashfree-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyCashfreeSignature } from '../../../lib/verify';

interface CashfreePayload {
  // Payment Gateway and Payouts V2 use `type`; Secure ID and PPI use `event_type`.
  type?: string;
  event_type?: string;
  event_time?: string;
  data?: Record<string, any>;
}

function handleEvent(payload: CashfreePayload): void {
  const name = payload.type || payload.event_type;
  const data = payload.data || {};

  switch (name) {
    // --- Payment Gateway (the overview samples abbreviate some names) -------
    case 'PAYMENT_SUCCESS_WEBHOOK':
    case 'PAYMENT_SUCCESS':
      console.log(`Payment succeeded: order ${data.order?.order_id}, payment ${data.payment?.cf_payment_id}`);
      break;
    case 'PAYMENT_FAILED_WEBHOOK':
    case 'PAYMENT_FAILED':
      console.log(`Payment failed: order ${data.order?.order_id}`);
      break;
    case 'PAYMENT_USER_DROPPED_WEBHOOK':
    case 'PAYMENT_USER_DROPPED':
      console.log(`Customer dropped payment: order ${data.order?.order_id}`);
      break;
    case 'REFUND_STATUS_WEBHOOK':
      console.log(`Refund status update: ${data.refund?.refund_id}`);
      break;
    case 'SETTLEMENT_STATUS_WEBHOOK':
      console.log('Settlement status update');
      break;

    // --- Payouts V2 --------------------------------------------------------
    case 'TRANSFER_SUCCESS':
    case 'TRANSFER_FAILED':
    case 'TRANSFER_REVERSED':
      console.log(`${name}: transfer ${data.transfer_id} (${data.status})`);
      break;

    // --- Secure ID (event_type) --------------------------------------------
    case 'BANK_ACCOUNT_VERIFICATION_SUCCESS':
      console.log(`Bank account verified: ${data.reference_id} (${data.account_status})`);
      break;
    case 'VKYC_AUDITOR_REVIEW_COMPLETED':
      console.log(`Video KYC review done: ${data.verification_id} (${data.sub_status})`);
      break;

    // --- PPI (event_type) --------------------------------------------------
    case 'PPI_CREDIT_SUCCESS':
      console.log(`Wallet credit: ${data.credit_id} to ${data.wallet_id}`);
      break;

    default:
      console.log(`Unhandled Cashfree event: ${name}`);
  }
}

// Cashfree treats anything other than HTTP 200 as a failure (3xx included).
export async function POST(request: NextRequest) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CASHFREE_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers the exact body, so never use request.json() first.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS) || 0;
  const result = verifyCashfreeSignature(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
    secret,
    tolerance
  );
  if (!result.ok) {
    console.error('Cashfree webhook verification failed:', result.error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: CashfreePayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // At-least-once, unordered delivery: dedupe on business IDs such as
    // cf_payment_id or transfer_id, and enqueue slow work instead of doing it here.
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Cashfree event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
