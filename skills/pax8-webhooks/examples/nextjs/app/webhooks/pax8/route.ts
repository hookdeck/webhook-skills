// Generated with: pax8-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyPax8Request } from '../../../lib/verify-pax8';

function handleEvent(payload: Record<string, unknown>): void {
  const { topic, sentAt } = classify(payload);

  // SUBSCRIPTION, INVOICE and PRODUCT are topic values printed in Pax8's docs. Read the
  // client, quote and user topic strings from GET /webhooks/topic-definitions.
  switch (topic) {
    case 'SUBSCRIPTION':
      console.log(`Pax8 subscription notification sent at ${sentAt}`);
      // Fetch the subscription from the Pax8 API and update your system.
      break;

    case 'INVOICE':
      console.log(`Pax8 invoice notification sent at ${sentAt}`);
      // Fetch the invoice from the Pax8 API and import it into billing.
      break;

    case 'PRODUCT':
      console.log(`Pax8 product notification sent at ${sentAt}`);
      // Refresh the product in your catalog cache.
      break;

    default:
      console.log(`Pax8 notification for topic ${topic ?? '(none)'}`);
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
