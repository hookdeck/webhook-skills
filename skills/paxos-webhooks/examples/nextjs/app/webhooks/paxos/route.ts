// Generated with: paxos-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaxosRequest } from '../../../lib/verify-paxos';

interface PaxosEvent {
  id?: string;
  type: string;
  source?: string;
  time?: string;
  object?: string;
  is_test?: boolean;
}

function handleEvent(event: PaxosEvent): void {
  const { id, type } = event;

  // At-least-once delivery: dedupe on event.id before doing real work.
  // Events are thin: fetch the full object with the Get Event API using event.id.
  switch (type) {
    case 'identity.approved':
      console.log(`Identity approved (event ${id})`);
      // TODO: Get Event, then mark the identity as verified
      break;

    case 'identity.denied':
      console.log(`Identity denied (event ${id})`);
      // TODO: Get Event, then notify the customer
      break;

    case 'identity.documents_required':
      console.log(`Identity documents required (event ${id})`);
      // TODO: Get Event, then ask the customer for documents
      break;

    case 'identity.documents_accepted':
    case 'identity.documents_denied':
      console.log(`Identity EDD review result: ${type} (event ${id})`);
      // TODO: Get Event for the review outcome
      break;

    default:
      if (/^transfer\.[a-z_]+\.(pending|completed|failed)$/.test(type)) {
        console.log(`Transfer event ${type} (event ${id})`);
        // TODO: Get Event, then update the deposit or withdrawal, e.g. transfer.crypto_deposit.completed
      } else if (/^orchestration\.(processing|pending|rejected|completed|failed)$/.test(type)) {
        console.log(`Orchestration event ${type} (event ${id})`);
        // TODO: Get Event, then update the mint, convert or redeem
      } else {
        console.log(`Unhandled event: ${type}`);
      }
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPaxosRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = payload as PaxosEvent;
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Expected a JSON event object with a type' }, { status: 400 });
  }

  // Test events come from the Dashboard Test feature only.
  if (event.is_test === true) {
    console.log('Received test event, ignoring...');
    return NextResponse.json({ received: true, test: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Paxos event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
