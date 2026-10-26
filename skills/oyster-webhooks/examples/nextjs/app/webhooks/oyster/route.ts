// Generated with: oyster-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOysterRequest } from '../../../lib/verify-oyster';

interface OysterEvent {
  eventName: string;
  eventTimestamp?: string;
  id?: string;
  companyId?: string;
  data?: Record<string, unknown>;
}

function handleEvent(event: OysterEvent): void {
  const data = event.data ?? {};

  switch (event.eventName) {
    case 'hiring.employment_engaged':
      console.log(`Employment engaged: engagement ${data.engagementId}`);
      // TODO: mark the hire as engaged in your system
      break;

    case 'expenses.expense_approved':
      console.log(`Expense ${data.expenseId} approved (${data.previousReviewState} -> ${data.reviewState})`);
      // TODO: reimburse or book the expense
      break;

    case 'contract.change_applied':
      console.log(`Contract change ${data.engagementChangeId} applied (${data.changeType}, ${data.state})`);
      // TODO: sync the updated contract terms
      break;

    case 'benefits.enrollment_enrolled':
      console.log(`Benefits enrollment ${data.enrollmentId} enrolled for engagement ${data.engagementId}`);
      // TODO: record the enrollment
      break;

    default:
      console.log(`Unhandled Oyster event: ${event.eventName}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOysterRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = payload as Partial<OysterEvent> | null;
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.eventName !== 'string') {
    return NextResponse.json({ error: 'Expected a JSON object with an eventName' }, { status: 400 });
  }

  // Oyster may deliver the same webhook more than once: dedupe on event.id (wh_...)
  // in your own store before doing real work.
  try {
    handleEvent(event as OysterEvent);
  } catch (err) {
    console.error('Error handling Oyster webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Oyster needs a 200 within 5 seconds.
  return NextResponse.json({ received: true });
}
