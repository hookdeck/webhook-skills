// Generated with: cin7-core-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCin7CoreRequest } from '../../../lib/verify-cin7-core';

interface Cin7CorePayload {
  EventType?: string;
  [key: string]: unknown;
}

function handleEvent(payload: Cin7CorePayload): void {
  const { EventType } = payload;

  switch (EventType) {
    case 'Sale/Created':
      console.log('Sale created');
      // Sync the new sale to your system
      break;

    case 'Sale/OrderAuthorised':
      console.log('Sale order authorised');
      // Start fulfilment
      break;

    case 'Sale/ShipmentAuthorised':
      console.log('Sale shipment authorised');
      // Notify the customer / update tracking
      break;

    case 'Purchase/OrderAuthorised':
      console.log('Purchase order authorised');
      // Sync the purchase to accounting
      break;

    case 'Product/Updated':
      console.log('Product updated');
      // Refresh your catalogue
      break;

    default:
      console.log(`Unhandled event: ${EventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCin7CoreRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Stock/AvailableStockLevelChanged and Task/Overdue send a JSON array with no
  // EventType. Give those webhooks their own URL and handle them by route.
  if (Array.isArray(payload)) {
    console.log(`Array body with ${payload.length} row(s)`);
    return NextResponse.json({ received: true });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object or array' }, { status: 400 });
  }

  try {
    handleEvent(payload as Cin7CorePayload);
  } catch (err) {
    console.error('Error handling Cin7 Core event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
