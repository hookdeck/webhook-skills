// Generated with: fourkites-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFourKitesRequest } from '../../../lib/verify-fourkites';

interface FourKitesPayload {
  MessageType?: string;
  LoadNumber?: string;
  [key: string]: unknown;
}

function handleEvent(payload: FourKitesPayload): void {
  const { MessageType: type, LoadNumber: load } = payload;

  switch (type) {
    case 'LOAD_CREATION':
      console.log(`Load created: ${load} (FourKitesLoadId ${payload.FourKitesLoadId})`);
      // TODO: store FourKitesLoadId against your load
      break;

    case 'LOCATION_UPDATE':
      console.log(`Location update: ${load}`);
      // TODO: update the live map
      break;

    case 'TRACKING_UPDATE':
      console.log(`Tracking update: ${load} ${payload.Status ?? ''} ${payload.Message ?? ''}`);
      // TODO: raise delay or status alerts
      break;

    case 'STOP_ETA_UPDATED':
      console.log(`Stop ETA updated: ${load}`);
      // TODO: re-plan dock appointments
      break;

    case 'STOP_ARRIVAL':
      console.log(`Stop arrival: ${load} at ${payload.StopName}`);
      // TODO: start the detention clock
      break;

    case 'STOP_DEPARTURE':
      console.log(`Stop departure: ${load} from ${payload.StopName}`);
      // TODO: advance pickup/delivery progress
      break;

    case 'STOP_AUTO_COMPLETED':
      console.log(`Stop auto-completed: ${load}`);
      // TODO: close out the stop
      break;

    case 'MANUALLY_DELIVERED':
      console.log(`Manually delivered: ${load}`);
      // TODO: close the shipment
      break;

    case 'MANUALLY_PICKED_UP':
      console.log(`Manually picked up: ${load}`);
      // TODO: start in-transit tracking
      break;

    case 'STOP_APPOINTMENT_RESCHEDULED':
      console.log(`Stop appointment rescheduled: ${load}`);
      // TODO: sync appointments
      break;

    case 'STOP_AMEND':
      console.log(`Stop amended: ${load}`);
      // TODO: sync stop details
      break;

    case 'LOAD_DELETED':
      console.log(`Load deleted: ${load}`);
      // TODO: remove it downstream
      break;

    default:
      console.log(`Unhandled MessageType: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFourKitesRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
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
    handleEvent(payload as FourKitesPayload);
  } catch (err) {
    console.error('Error handling FourKites callback:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
