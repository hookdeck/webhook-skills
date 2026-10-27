// Generated with: remote-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRemoteSignature } from '../../../lib/verify-remote';

function handleEvent(event: Record<string, any>) {
  switch (event.event_type) {
    case 'employment.onboarding.completed':
      console.log(`Onboarding completed for employment ${event.employment_id}`);
      // TODO: provision accounts, notify the manager
      break;

    case 'employment.onboarding_task.completed':
      console.log(`Onboarding task "${event.completed_task?.name}" completed for employment ${event.employment_id}`);
      // TODO: update your onboarding checklist
      break;

    case 'timeoff.requested':
      console.log(`Time off requested (employment ${event.employment_id})`);
      // TODO: route to the approver
      break;

    case 'timeoff.approved':
      console.log(`Time off approved (employment ${event.employment_id})`);
      // TODO: update your calendar
      break;

    case 'payslip.released':
      console.log(`Payslip released (employment ${event.employment_id})`);
      // TODO: fetch the payslip through the Remote API
      break;

    case 'contract.termination_date_reached':
      console.log(`Contract termination date reached (employment ${event.employment_id})`);
      // TODO: start offboarding in your systems
      break;

    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes: nothing is parsed before the signature check.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const valid = verifyRemoteSignature(
    rawBody,
    request.headers.get('x-remote-signature'),
    request.headers.get('x-remote-timestamp'),
  );
  if (!valid) {
    // Remote counts 4xx as delivered and never retries it.
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(event as Record<string, any>);
  } catch (err) {
    // Remote does not retry 5xx either: log it, then replay via the webhook-events API.
    console.error('Error handling Remote event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
