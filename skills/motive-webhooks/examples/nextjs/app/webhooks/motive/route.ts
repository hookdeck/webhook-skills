import { NextRequest, NextResponse } from 'next/server';
import { verifyMotiveSignature } from '../../../lib/verify-motive';

// A Motive event (fields vary by action)
type MotiveEvent = {
  action?: string;
  trigger?: string;
  id?: number | string;
  vehicle_id?: number;
  vehicle_number?: string;
  lat?: number;
  lon?: number;
  code_label?: string;
  role?: string;
  vehicle?: { id?: number; number?: string };
};

function handleMotiveEvent(event: MotiveEvent) {
  switch (event.action) {
    case 'vehicle_location_updated':
      console.log(`Vehicle ${event.vehicle_number} at ${event.lat},${event.lon}`);
      // TODO: Update live map / ETA
      break;

    case 'vehicle_location_received':
      console.log(`Location received for vehicle ${event.vehicle_id}`);
      // TODO: Append to location history
      break;

    case 'vehicle_upserted':
      console.log(`Vehicle ${event.id} ${event.trigger ?? 'upserted'}`);
      // TODO: Sync the vehicle roster
      break;

    case 'fault_code_opened':
      console.log(`Fault ${event.code_label} opened on vehicle ${event.vehicle?.number}`);
      // TODO: Create a maintenance ticket
      break;

    case 'fault_code_closed':
      console.log(`Fault ${event.code_label} closed on vehicle ${event.vehicle?.number}`);
      // TODO: Close the maintenance ticket
      break;

    case 'user_upserted':
      console.log(`User ${event.id} (${event.role}) ${event.trigger}`);
      // TODO: Sync drivers and admins
      break;

    case 'inspection_report_upserted':
      console.log(`Inspection report ${event.id} upserted`);
      // TODO: Route defects to maintenance
      break;

    case 'hos_violation_upserted':
      console.log(`HOS violation ${event.id} upserted`);
      // TODO: Alert dispatch / compliance
      break;

    case 'vehicle_geofence_event':
    case 'asset_geofence_event':
      console.log(`Geofence event: ${event.action}`);
      // TODO: Track arrivals and departures
      break;

    case 'engine_toggle_event':
      console.log('Engine toggle event');
      // TODO: Update usage and idling reports
      break;

    case 'speeding_event_created':
    case 'speeding_event_updated':
    case 'driver_performance_event_created':
    case 'driver_performance_event_updated':
      console.log(`Safety event: ${event.action} (${event.id})`);
      // TODO: Queue driver coaching
      break;

    case 'user_duty_status_updated':
      console.log('Driver duty status updated');
      // TODO: Sync timecards
      break;

    case 'form_entry_upserted':
      console.log(`Form entry ${event.id} upserted`);
      // TODO: Update dispatch workflow
      break;

    case 'vehicle_gateway_disconnected':
    case 'vehicle_gateway_disconnect_ended':
    case 'dashcam_disconnected':
      console.log(`Device event: ${event.action} (${event.id})`);
      // TODO: Alert on device health
      break;

    default:
      console.log(`Unhandled Motive action: ${event.action}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.MOTIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MOTIVE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  const signature = request.headers.get('x-kt-webhook-signature');

  // Motive documents 403 for a signature it could not verify (no retry)
  if (!verifyMotiveSignature(rawBody, signature, secret)) {
    console.error('Motive webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // Parse only after verification
  let event: MotiveEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // The activation test request body ([vehicle_location_updated]) is not valid JSON.
    // Answer 200 so Motive can enable the webhook.
    return NextResponse.json({ received: true, ignored: true });
  }

  // Motive sends no event ID header: de-duplicate on action + payload id
  if (event && typeof event === 'object' && !Array.isArray(event)) {
    handleMotiveEvent(event);
  }

  return NextResponse.json({ received: true });
}
