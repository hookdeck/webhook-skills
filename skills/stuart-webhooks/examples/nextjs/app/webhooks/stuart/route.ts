// Generated with: stuart-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyStuartRequest } from '../../../lib/verify-stuart';

interface StuartPayload {
  topic?: string;
  event_id?: string;
  details?: {
    package?: { id?: string; reference?: string };
    courier?: { name?: string };
    task?: string;
    new_package?: { id?: string };
    cancelation?: { key?: string };
    return?: { key?: string };
    reassigning?: { key?: string };
    coordinates?: { latitude?: number; longitude?: number };
  };
  [key: string]: unknown;
}

function handleEvent(payload: StuartPayload): void {
  const { topic } = payload;
  const details = payload.details ?? {};
  const ref = `${details.package?.id} (${details.package?.reference})`;

  switch (topic) {
    case 'package_created':
      console.log(`Package created: ${ref}`);
      // TODO: store details.package.id next to your order
      break;

    case 'courier_assigned':
      console.log(`Courier assigned to ${ref}: ${details.courier?.name}`);
      // TODO: show the courier name and tracking URLs
      break;

    case 'courier_arriving':
      console.log(`Courier arriving at ${details.task} for ${ref}`);
      // TODO: tell the store (pickup) or customer (dropoff)
      break;

    case 'package_split':
      console.log(`Package ${ref} split into ${details.new_package?.id}`);
      // TODO: track the new package
      break;

    case 'courier_waiting':
      console.log(`Courier waiting at ${details.task} for ${ref}`);
      // TODO: nudge the store or customer
      break;

    case 'package_delivering':
      console.log(`Package delivering: ${ref}`);
      // TODO: mark the order out for delivery
      break;

    case 'package_delivered':
      console.log(`Package delivered: ${ref}`);
      // TODO: close the order
      break;

    case 'package_canceled':
      console.log(`Package canceled: ${ref} (${details.cancelation?.key})`);
      // TODO: refund or reship
      break;

    case 'package_returning':
      console.log(`Package returning: ${ref} (${details.return?.key})`);
      // TODO: flag the failed delivery
      break;

    case 'package_returned':
      console.log(`Package returned: ${ref}`);
      // TODO: restock
      break;

    case 'courier_reassigning':
      console.log(`Courier reassigning: ${ref} (${details.reassigning?.key})`);
      // TODO: reset the ETA
      break;

    case 'courier_moving':
      console.log(`Courier moving for ${ref}`);
      // TODO: update the live map from details.coordinates
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyStuartRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing authentication header' }, { status: 401 });
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
    // TODO: deduplicate on payload.event_id (unique except on retries)
    handleEvent(payload as StuartPayload);
  } catch (err) {
    console.error('Error handling Stuart event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
