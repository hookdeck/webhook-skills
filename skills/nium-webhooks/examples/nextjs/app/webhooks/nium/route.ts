// Generated with: nium-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNiumRequest } from '../../../lib/verify-nium';

interface NiumPayload {
  template?: string;
  rfiDetails?: { rfiId?: string; status?: string; query?: string };
  [key: string]: unknown;
}

function handleEvent(payload: NiumPayload): void {
  // Most events name themselves in `template`. RFI events carry rfiDetails.status instead.
  const event = payload.template || payload.rfiDetails?.status;

  switch (event) {
    case 'CUSTOMER_STATUS_WEBHOOK':
      console.log(`Customer ${payload.customerHashId} status: ${payload.status}/${payload.subStatus}`);
      // TODO: update the customer's onboarding state; check payload.resubmissionAllowed on rejection
      break;

    case 'CUSTOMER_ODD_STATUS_WEBHOOK':
      console.log(`Customer ODD status changed: ${payload.customerHashId}`);
      // TODO: track ongoing due diligence
      break;

    case 'CARD_CLIENT_KYB_STATUS_WEBHOOK':
      console.log(`Client KYB status: ${payload.status} (${payload.complianceStatus})`);
      // TODO: gate go-live on KYB completion
      break;

    case 'REMIT_TRANSACTION_INITIATED_WEBHOOK':
      console.log(`Payout initiated: ${payload.systemReferenceNumber}`);
      // TODO: mark the payout as in flight
      break;

    case 'REMIT_TRANSACTION_PAID_WEBHOOK':
      console.log(`Payout paid: ${payload.systemReferenceNumber}`);
      // TODO: mark the payout as settled
      break;

    case 'REMIT_TRANSACTION_REJECTED_WEBHOOK':
      console.log(`Payout rejected: ${payload.systemReferenceNumber}`);
      // TODO: release funds and notify the sender
      break;

    case 'REMIT_TRANSACTION_RETURNED_WEBHOOK':
      console.log(`Payout returned: ${payload.systemReferenceNumber}`);
      // TODO: refund the sender
      break;

    case 'FX_CONVERSION_COMPLETED_WEBHOOK':
      console.log(`FX conversion completed: ${payload.systemReferenceNumber}`);
      // TODO: update wallet balances
      break;

    case 'FX_CONVERSION_FAILED_WEBHOOK':
    case 'FX_CONVERSION_CANCELLED_WEBHOOK':
      console.log(`FX conversion not completed (${event}): ${payload.systemReferenceNumber}`);
      // TODO: alert and retry or release the quote
      break;

    case 'CARD_POS_APPROVED_WEBHOOK':
    case 'CARD_ATM_APPROVED_WEBHOOK':
      console.log(`Card transaction approved (${event}): ${payload.merchantName} ${payload.transactionAmount} ${payload.transactionCurrency}`);
      // TODO: record the authorization against payload.cardHashId
      break;

    case 'CARD_WALLET_FUNDING_WEBHOOK':
      console.log(`Card wallet funded: ${payload.walletHashId}`);
      // TODO: credit the customer's balance
      break;

    case 'VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK':
      console.log(`Virtual account assigned: ${payload.customerHashId}`);
      // TODO: show the new account details to the customer
      break;

    case 'INCOMING_FUNDS_WEBHOOK':
      console.log(`Incoming funds: ${payload.walletHashId}`);
      // TODO: reconcile the deposit
      break;

    case 'RFI_REQUESTED':
      console.log(`RFI requested: ${payload.rfiDetails?.rfiId}`);
      // TODO: ask the customer to respond (payload.rfiDetails?.query)
      break;

    case 'RFI_RESPONDED':
      console.log(`RFI responded: ${payload.rfiDetails?.rfiId}`);
      // TODO: mark the RFI as answered
      break;

    case 'RFI_CLOSED':
      console.log(`RFI closed: ${payload.rfiDetails?.rfiId}`);
      // TODO: stop chasing the customer
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNiumRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
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
    handleEvent(payload as NiumPayload);
  } catch (err) {
    console.error('Error handling Nium event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Nium treats anything other than 200 as a failed delivery.
  return NextResponse.json({ received: true });
}
