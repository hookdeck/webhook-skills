// Generated with: savvycal-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySavvyCalSignature } from '../../../lib/savvycal';

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification - do not parse JSON first
  const rawBody = await request.text();
  const header = request.headers.get('x-savvycal-signature');

  if (!header) {
    return NextResponse.json(
      { error: 'Missing x-savvycal-signature header' },
      { status: 400 }
    );
  }

  if (!verifySavvyCalSignature(rawBody, header, process.env.SAVVYCAL_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Signature is valid - safe to parse the event
  let event: { type?: string; id?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.type) {
    case 'event.created':
      console.log('Event scheduled:', event.id);
      // TODO: Create CRM record, send confirmation, provision resources, etc.
      break;

    case 'event.rescheduled':
      console.log('Event rescheduled:', event.id);
      // TODO: Update calendar holds, notify attendees, sync to CRM, etc.
      break;

    case 'event.canceled':
      console.log('Event canceled:', event.id);
      // TODO: Free up availability, trigger win-back flow, update CRM, etc.
      break;

    case 'event.changed':
      console.log('Event changed:', event.id);
      // TODO: Diff the change details and sync downstream systems
      break;

    case 'event.checkout.completed':
      console.log('Checkout completed:', event.id);
      // TODO: Mark the booking as paid, issue receipts, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 2xx quickly to acknowledge receipt
  return NextResponse.json({ received: true });
}
