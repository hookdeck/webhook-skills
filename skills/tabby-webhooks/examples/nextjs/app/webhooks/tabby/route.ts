// Generated with: tabby-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTabbyRequest } from '../../../lib/verify-tabby';

interface TabbyPayload {
  id?: string;
  status?: string;
  dispute_id?: string;
  payment_id?: string;
  captures?: unknown[];
  refunds?: unknown[];
  [key: string]: unknown;
}

// Payment webhooks have no event field: the event is what changed.
function handlePayment(payment: TabbyPayload): void {
  const { id, status } = payment;
  const captures = payment.captures ?? [];
  const refunds = payment.refunds ?? [];

  switch (status) {
    case 'authorized':
      if (captures.length === 0) {
        console.log(`Payment authorized: ${id}`);
        // TODO: process the order, then send the Capture Request
      } else {
        console.log(`Payment captured: ${id}`);
        // TODO: nothing to do, this confirms your own capture
      }
      break;

    case 'closed':
      if (refunds.length > 0) {
        console.log(`Payment closed with refunds: ${id}`);
        // TODO: record the latest entry in payment.refunds
      } else {
        console.log(`Payment closed: ${id}`);
        // TODO: mark the order paid; never downgrade a closed payment to authorized
      }
      break;

    case 'rejected':
      console.log(`Payment rejected: ${id}`);
      // TODO: cancel the order
      break;

    case 'expired':
      console.log(`Payment expired: ${id}`);
      // TODO: cancel the order
      break;

    default:
      console.log(`Unhandled payment status: ${status}`);
  }
}

// Dispute webhooks carry dispute_id and a dispute status.
function handleDispute(dispute: TabbyPayload): void {
  const { dispute_id: disputeId, payment_id: paymentId, status } = dispute;

  switch (status) {
    case 'pending':
      console.log(`Dispute opened: ${disputeId} on payment ${paymentId}`);
      // TODO: fetch the dispute and gather evidence
      break;

    case 'arbitration':
      console.log(`Dispute in arbitration: ${disputeId}`);
      break;

    case 'evidence_merchant':
      console.log(`Dispute evidence requested: ${disputeId}`);
      // TODO: provide supporting evidence
      break;

    case 'approved':
      console.log(`Dispute approved: ${disputeId}`);
      // TODO: record the refund to the customer
      break;

    case 'declined':
      console.log(`Dispute declined: ${disputeId}`);
      break;

    case 'cancelled':
      console.log(`Dispute cancelled: ${disputeId}`);
      break;

    default:
      console.log(`Unhandled dispute status: ${status}`);
  }
}

function handleEvent(payload: TabbyPayload): void {
  if (payload.dispute_id) handleDispute(payload);
  else handlePayment(payload);
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTabbyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Tabby auth header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as TabbyPayload);
  } catch (err) {
    console.error('Error handling Tabby event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Tabby treats anything other than 200 as a delivery error and retries.
  return NextResponse.json({ received: true }, { status: 200 });
}
