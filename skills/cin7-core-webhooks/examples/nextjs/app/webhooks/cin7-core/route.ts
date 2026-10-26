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
      // TODO: sync the new sale to your system
      break;

    case 'Sale/OrderAuthorised':
      console.log('Sale order authorised');
      // TODO: start fulfilment
      break;

    case 'Sale/ShipmentAuthorised':
      console.log('Sale shipment authorised');
      // TODO: notify the customer / update tracking
      break;

    case 'Purchase/OrderAuthorised':
      console.log('Purchase order authorised');
      // TODO: sync the purchase to accounting
      break;

    case 'Product/Updated':
      console.log('Product updated');
      // TODO: refresh your catalogue
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

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Cin7CorePayload);
  } catch (err) {
    console.error('Error handling Cin7 Core event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
