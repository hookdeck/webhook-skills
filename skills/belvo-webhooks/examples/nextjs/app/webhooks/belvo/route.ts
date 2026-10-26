// Generated with: belvo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyBelvoRequest, type BelvoKind } from '../../../lib/verify-belvo';

type Payload = Record<string, any>;

function handlePayments(code: string, payload: Payload): void {
  const details = payload.details || {};

  switch (code) {
    case 'payment_request_successful':
      console.log(`Payment request ${details.id} succeeded: ${details.amount}`);
      // TODO: mark the payment as paid
      break;

    case 'payment_request_failed':
      console.log(`Payment request ${details.id} failed: ${details.failedReason}`);
      // TODO: notify the customer and retry or cancel
      break;

    case 'payment_request_chargeback':
      console.log(`Payment request ${details.id} charged back`);
      // TODO: flag the payment and the customer for review
      break;

    case 'consent_submitted':
    case 'consent_confirmed':
    case 'consent_incomplete_information':
    case 'consent_rejected':
      console.log(`Consent ${details.id} (${code}), payment method ${details.paymentMethodId}`);
      // TODO: update the consent state; details.reasons lists files that failed validation
      break;

    case 'payment_method_registration_successful':
    case 'payment_method_registration_failed':
    case 'payment_method_registration_canceled':
      console.log(`Payment method ${details.id}: ${code}`);
      // TODO: activate or discard the payment method
      break;

    case 'customer_blocked':
    case 'customer_unblocked':
      // Sent to every merchant, so the customer may not exist in your system
      console.log(`Customer ${code} for document ${details.documentNumber}`);
      // TODO: check your own customers for this documentNumber
      break;

    case 'withdrawal_created':
      console.log(`Withdrawal ${details.id}: ${details.fromDatetime} to ${details.toDatetime}`);
      // TODO: reconcile the settlement period
      break;

    default:
      console.log(`Unhandled Belvo payments event: ${code}`);
  }
}

function handleAggregation(code: string, payload: Payload): void {
  const label = `${payload.webhook_type} ${code} (link ${payload.link_id})`;
  const errors = payload.data?.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    console.log(`Belvo aggregation error for ${label}: ${errors[0].code}`);
    // TODO: surface the error; operational_limits_reached means retry later
    return;
  }

  switch (code) {
    case 'historical_update':
    case 'new_accounts_available':
    case 'new_transactions_available':
    case 'transactions_updated':
    case 'transactions_deleted':
      console.log(`Belvo data ready: ${label}`);
      // TODO: fetch the new data for this link_id from the Belvo API
      break;

    case 'invalid_credentials':
    case 'token_required':
      console.log(`Belvo link needs the user to act: ${label}`);
      // TODO: ask the user to update the link
      break;

    case 'link_deleted':
      console.log(`Belvo link deleted: ${label}`);
      // TODO: remove the stored link
      break;

    default:
      console.log(`Unhandled Belvo aggregation event: ${label}`);
  }
}

function handlePaymentsBrazil(kind: BelvoKind, payload: Payload): void {
  // Brazil webhooks only identify the resource: fetch it from
  // GET /payments/br/{resource}/{id}/ (V2: send X-Belvo-API-Resource-Version: Payments-BR.V2).
  if (kind.family === 'payments_br_v2') {
    console.log(`Belvo Brazil ${kind.code} ${kind.id} updated at ${payload.timestamp}`);
  } else if (kind.family === 'payments_br_v1') {
    const data = payload.data || {};
    console.log(`Belvo Brazil ${kind.type} ${kind.code} for ${payload.object_id}: ${data.status}`);
  }
  // TODO: fetch the resource and update your records
}

function handleEvent(payload: Payload): void {
  const kind = classify(payload);
  if (!kind) {
    console.log('Unhandled Belvo payload (no eventCode, resource or webhook_code)');
  } else if (kind.family === 'payments_mx') {
    handlePayments(kind.code, payload);
  } else if (kind.family === 'payments_br_v1' || kind.family === 'payments_br_v2') {
    handlePaymentsBrazil(kind, payload);
  } else {
    handleAggregation(kind.code, payload);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBelvoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Payload);
  } catch (err) {
    console.error('Error handling Belvo webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
