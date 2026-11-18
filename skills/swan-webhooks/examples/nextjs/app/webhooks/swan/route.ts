// Generated with: swan-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySwanRequest, processedEventIds } from '../../../lib/verify-swan';

interface SwanNotification {
  eventType?: string;
  eventId?: string;
  eventDate?: string;
  projectId?: string;
  resourceId?: string;
}

function handleEvent(payload: SwanNotification): void {
  const { eventType, resourceId } = payload;

  // Notifications are thin: query the Swan API with resourceId for the details.
  switch (eventType) {
    case 'Transaction.Booked':
      console.log(`Transaction booked: ${resourceId}`);
      // Your code: fetch the transaction and update your ledger
      break;

    case 'Transaction.Pending':
      console.log(`Transaction pending: ${resourceId}`);
      // Your code: show the transaction as pending
      break;

    case 'Transaction.Rejected':
      console.log(`Transaction rejected: ${resourceId}`);
      // Your code: notify the account holder
      break;

    case 'Account.Created':
      console.log(`Account created: ${resourceId}`);
      // Your code: provision the account in your system
      break;

    case 'AccountHolder.Updated':
      console.log(`Account holder updated: ${resourceId}`);
      // Your code: refresh the account holder's verification status
      break;

    case 'Card.Created':
      console.log(`Card created: ${resourceId}`);
      // Your code: store the card reference
      break;

    case 'Onboarding.Updated':
      console.log(`Onboarding updated: ${resourceId}`);
      // Your code: fetch the onboarding and advance your KYC flow
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySwanRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-swan-secret' }, { status: 401 });
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

  const notification = payload as SwanNotification;

  // Dedupe on eventId (at-least-once delivery); acknowledge duplicates.
  if (notification.eventId && processedEventIds.has(notification.eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(notification);
  } catch (err) {
    console.error('Error handling Swan event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (notification.eventId) processedEventIds.add(notification.eventId);
  return NextResponse.json({ received: true });
}
