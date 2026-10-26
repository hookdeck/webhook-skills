// Generated with: pax8-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyPax8Request } from '../../../lib/verify-pax8';

function handleEvent(payload: Record<string, unknown>): void {
  const { topic, action } = classify(payload);

  // SUBSCRIPTION and PRODUCT are the topic values the docs show; INVOICE, CLIENT, QUOTE
  // and USER are assumed from the docs' event category names. Check topic-definitions.
  switch (topic) {
    case 'SUBSCRIPTION':
      console.log(`Pax8 subscription ${action}`);
      // TODO: sync the subscription (the docs show the CREATE action) to your system
      break;

    case 'INVOICE':
      console.log(`Pax8 invoice ${action}`);
      // TODO: import the invoice into billing
      break;

    case 'CLIENT':
      console.log(`Pax8 client ${action}`);
      // TODO: update your customer record
      break;

    case 'PRODUCT':
      console.log(`Pax8 product ${action}`);
      // TODO: refresh your catalog cache
      break;

    case 'QUOTE':
      console.log(`Pax8 quote ${action}`);
      // TODO: sync the quote
      break;

    case 'USER':
      console.log(`Pax8 user ${action}`);
      // TODO: sync the user
      break;

    default:
      console.log('Unclassified Pax8 payload (no recognized topic)');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPax8Request(request.headers)) {
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
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Pax8 webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Pax8 marks a delivery failed after 10 seconds: acknowledge quickly.
  return NextResponse.json({ received: true });
}
