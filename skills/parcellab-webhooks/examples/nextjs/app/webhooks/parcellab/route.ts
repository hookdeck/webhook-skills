// Generated with: parcellab-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { getEventName, verifyParcellabRequest } from '../../../lib/verify-parcellab';

function handleEvent(payload: Record<string, unknown>): void {
  const event = getEventName(payload);
  // Native: references at the top level. CloudEvents: nested in `data`.
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const references = (payload.references ?? data.references ?? {}) as Record<string, unknown>;
  const tracking = references.tracking_number;

  switch (event) {
    case 'onCreated':
    case 'onUpdated':
      console.log(`Record ${event === 'onCreated' ? 'created' : 'updated'} for ${tracking}`);
      // TODO: sync the order/tracking record
      break;

    case 'onDispatch':
      console.log(`Shipment ${tracking} dispatched`);
      // TODO: mark the order as shipped
      break;

    case 'onScheduled':
      console.log(`Delivery scheduled for ${tracking}`);
      // TODO: store the announced delivery date or time window
      break;

    case 'onOutForDelivery':
      console.log(`Shipment ${tracking} is out for delivery`);
      break;

    case 'onDelay':
    case 'onInternalDelay':
    case 'onFailedAttempt':
      console.log(`Delivery problem (${event}) for ${tracking}`);
      // TODO: alert support or notify the customer
      break;

    case 'onPickupReady':
      console.log(`Shipment ${tracking} is ready for pickup`);
      break;

    case 'onDelivered':
      console.log(`Shipment ${tracking} delivered`);
      // TODO: mark the order as delivered
      break;

    case 'onReturn':
      console.log(`Shipment ${tracking} is being returned to the sender`);
      // TODO: start your returns flow
      break;

    default:
      console.log('Unhandled parcelLab event:', event || '(none)');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyParcellabRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
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
    console.error('Error handling parcelLab webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
