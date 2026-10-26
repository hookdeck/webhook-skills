// Generated with: timify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTimifyRequest } from '../../../lib/verify-timify';

// TIMIFY's overview page does not document the payload fields; this shape is illustrative.
interface TimifyPayload {
  webhook?: string;
  name?: string;
  resource?: string;
  type?: string;
  action?: string;
  data?: unknown;
  [key: string]: unknown;
}

// Normalize "Customer Fields" / "customer_fields" / "customerFields" to "customerfields".
const normalize = (value: unknown): string =>
  String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Defensive dispatch: looks for the webhook name and type under a few likely keys and
 * acknowledges anything it doesn't recognise. Adjust to the payloads you actually receive.
 */
function handleEvent(payload: TimifyPayload): void {
  const rawName = payload.webhook ?? payload.name ?? payload.resource;
  const rawType = payload.type ?? payload.action;
  const name = normalize(rawName);
  const type = normalize(rawType);
  const label = `${rawName} ${rawType}`;

  switch (name) {
    case 'customers':
      console.log(`Customers ${type}: ${label}`);
      // TODO: sync the customer record (payload.data)
      break;

    case 'event':
      console.log(`Event ${type}: ${label}`);
      // TODO: create, update or cancel the booking in your system
      break;

    case 'events':
      console.log(`Events ${type}: ${label}`);
      // TODO: remove the deleted bookings
      break;

    case 'services':
      console.log(`Services ${type}: ${label}`);
      // TODO: sync the service catalogue
      break;

    case 'resource':
      console.log(`Resource ${type}: ${label}`);
      // TODO: sync staff, rooms or equipment
      break;

    case 'company':
      console.log(`Company ${type}: ${label}`);
      // TODO: sync company details
      break;

    case 'manager':
      console.log(`Manager ${type}: ${label}`);
      // TODO: sync manager accounts
      break;

    case 'enterprise':
      console.log(`Enterprise ${type}: ${label}`);
      // TODO: sync enterprise settings
      break;

    case 'customerfields':
      console.log(`Customer Fields ${type}: ${label}`);
      // TODO: sync custom customer field definitions
      break;

    case 'shift':
      console.log(`Shift ${type}: ${label}`);
      // TODO: sync working hours
      break;

    case 'notification':
      console.log(`Notification ${type}: ${label}`);
      // TODO: forward the notification
      break;

    case 'servicegroups':
      console.log(`Service Groups ${type}: ${label}`);
      // TODO: sync service groups
      break;

    default:
      console.log(`Unhandled TIMIFY event: ${label}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTimifyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing TIMIFY webhook header' }, { status: 401 });
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
    handleEvent(payload as TimifyPayload);
  } catch (err) {
    console.error('Error handling TIMIFY event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
