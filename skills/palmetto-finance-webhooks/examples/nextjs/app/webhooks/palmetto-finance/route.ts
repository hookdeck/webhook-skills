// Generated with: palmetto-finance-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPalmettoFinanceRequest } from '../../../lib/verify-palmetto-finance';

interface PalmettoFinancePayload {
  event?: string;
  accountId?: string;
  [key: string]: unknown;
}

const EVENT_LABELS: Record<string, string> = {
  accountCreated: 'Account created',
  accountUpdated: 'Account updated',
  sendInvite: 'Consumer application invite sent',
  applicationStatus: 'Application status changed',
  contractApproved: 'Contract approved',
  contractSending: 'Contract sending',
  contractSent: 'Contract sent',
  contractSigned: 'Contract signed',
  contractVoided: 'Contract voided',
  contractReinstated: 'Contract reinstated',
  documentStatus: 'Document status changed',
  documentUploaded: 'Document uploaded',
  milestonePackage: 'Milestone package',
  milestoneAchieved: 'Milestone achieved',
  milestoneStatusChanged: 'Milestone status changed',
  quoteCreated: 'Quote created',
  quoteVoided: 'Quote voided',
  requirementStatusChanged: 'Requirement status changed',
  requirementCompleted: 'Requirement completed',
  termsAndConditionsAccepted: 'Terms and conditions accepted',
  allConsumerTaskEvents: 'Consumer task', // check status and activityType
};

function handleEvent(payload: PalmettoFinancePayload): void {
  const { event, accountId } = payload;

  switch (event) {
    case 'accountCreated':
      console.log(`${EVENT_LABELS[event]}: ${accountId} (${payload.programType})`);
      // TODO: create the account in your system (payload.accountReference)
      break;

    case 'applicationStatus':
      console.log(`${EVENT_LABELS[event]}: ${accountId} application ${payload.applicationId}`);
      // TODO: update the application record (payload.applicants)
      break;

    case 'contractSigned':
      console.log(`${EVENT_LABELS[event]}: ${accountId} contract ${payload.contractReference}`);
      // TODO: mark the contract signed (payload.quoteReference)
      break;

    case 'milestoneAchieved':
      console.log(`${EVENT_LABELS[event]}: ${payload.newMilestone}`);
      // TODO: advance the project (payload.organizationId)
      break;

    case 'quoteCreated':
      console.log(`${EVENT_LABELS[event]}: ${accountId} quote ${payload.quoteId}`);
      // TODO: store the quote
      break;

    case 'documentUploaded':
      console.log(`${EVENT_LABELS[event]}: ${accountId} document ${payload.documentId}`);
      // TODO: fetch the document
      break;

    default:
      if (event && EVENT_LABELS[event]) {
        console.log(`${EVENT_LABELS[event]}: ${accountId}`);
      } else {
        console.log(`Unhandled event: ${event}`);
      }
  }
}

// Each Palmetto Finance subscription sets its own httpMethod, so every method uses this handler.
async function handler(request: NextRequest) {
  // Check the credential first, for every method, before reading the body.
  if (!verifyPalmettoFinanceRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing API key header' }, { status: 401 });
  }

  // Read as text so any content type is accepted (GET and DELETE may have no body).
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as PalmettoFinancePayload);
  } catch (err) {
    console.error('Error handling Palmetto Finance event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
