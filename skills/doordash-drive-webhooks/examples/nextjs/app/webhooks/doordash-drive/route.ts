// Generated with: doordash-drive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyDoorDashDriveRequest } from '../../../lib/verify-doordash-drive';

function handleEvent(payload: Record<string, any>): void {
  const name = classify(payload);

  switch (name) {
    case 'DASHER_CONFIRMED':
      console.log(`Dasher ${payload.dasher_id} confirmed delivery ${payload.external_delivery_id}`);
      // TODO: show the Dasher's name and vehicle to the customer
      break;

    case 'DASHER_CONFIRMED_PICKUP_ARRIVAL':
      console.log(`Dasher arrived at pickup for ${payload.external_delivery_id}`);
      break;

    case 'DASHER_PICKED_UP':
      console.log(`Delivery ${payload.external_delivery_id} picked up at ${payload.pickup_time_actual}`);
      // TODO: mark the order as out for delivery
      break;

    case 'DASHER_CONFIRMED_DROPOFF_ARRIVAL':
      console.log(`Dasher arrived at dropoff for ${payload.external_delivery_id}`);
      break;

    case 'DASHER_DROPPED_OFF':
      console.log(`Delivery ${payload.external_delivery_id} dropped off at ${payload.dropoff_time_actual}`);
      // TODO: mark the order as delivered
      break;

    case 'DELIVERY_CANCELLED':
      console.log(`Delivery ${payload.external_delivery_id} cancelled: ${payload.cancellation_reason}`);
      // TODO: cancel or re-dispatch the order
      break;

    case 'DELIVERY_RETURN_INITIALIZED':
    case 'DASHER_CONFIRMED_RETURN_ARRIVAL':
    case 'DELIVERY_RETURNED':
      console.log(`Return update ${name} for ${payload.external_delivery_id}`);
      break;

    case 'DELIVERY_BATCHED':
      console.log(`Delivery ${payload.external_delivery_id} batched (${payload.force_batch_id})`);
      break;

    case 'refund':
      console.log(`Refund: ${payload.event_data.reason} (${payload.event_data.amount} ${payload.event_data.currency_code})`);
      // TODO: record the refund
      break;

    default:
      if (name && name.startsWith('dasher_enroute_to_')) {
        console.log(`${name} for ${payload.external_delivery_id}:`, payload.dasher_location);
        // TODO: update the live map
      } else {
        console.log('Unhandled DoorDash Drive payload', name);
      }
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDoorDashDriveRequest(request.headers)) {
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
    handleEvent(payload as Record<string, any>);
  } catch (err) {
    console.error('Error handling DoorDash Drive webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // DoorDash retries anything other than 200 OK (3 attempts in total).
  return NextResponse.json({ received: true });
}
