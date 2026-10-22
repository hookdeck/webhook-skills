// Generated with: project44-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyProject44Request } from '../../../lib/verify-project44';

interface Project44Payload {
  eventId?: string;
  eventType?: string;
  context?: { shipment?: { shipmentId?: string } };
  data?: unknown;
  [key: string]: unknown;
}

function handleEvent(payload: Project44Payload): void {
  const { eventType, eventId } = payload;
  const shipmentId = payload.context?.shipment?.shipmentId;

  // project44 can redeliver after a lost response: dedupe on eventId in real code.
  switch (eventType) {
    case 'shipments.v1.shipment.created':
      console.log(`Shipment created: ${shipmentId} (${eventId})`);
      // TODO: register the shipment in your system
      break;

    case 'shipments.v1.shipment.deleted':
      console.log(`Shipment deleted: ${shipmentId} (${eventId})`);
      // TODO: stop tracking the shipment
      break;

    case 'shipments.v1.event.added':
      console.log(`Shipment event added: ${shipmentId} (${eventId})`);
      // TODO: record the new milestone from payload.data
      break;

    case 'shipments.v1.event.updated':
      console.log(`Shipment event updated: ${shipmentId} (${eventId})`);
      // TODO: update the milestone from payload.data
      break;

    case 'shipments.v1.event.removed':
      console.log(`Shipment event removed: ${shipmentId} (${eventId})`);
      // TODO: remove the milestone
      break;

    case 'shipments.v1.state.added':
      console.log(`Shipment state added: ${shipmentId} (${eventId})`);
      // TODO: record the new state from payload.data
      break;

    case 'shipments.v1.state.updated':
      console.log(`Shipment state updated: ${shipmentId} (${eventId})`);
      // TODO: update the state from payload.data
      break;

    case 'shipments.v1.state.removed':
      console.log(`Shipment state removed: ${shipmentId} (${eventId})`);
      // TODO: remove the state
      break;

    case 'shipments.v1.exception.addedOrUpdated':
      console.log(`Shipment exception added or updated: ${shipmentId} (${eventId})`);
      // TODO: alert on the exception in payload.data
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyProject44Request(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing API key header' }, { status: 401 });
  }

  // Read as text so any content type is accepted. An empty body (e.g. GET) is fine.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Project44Payload);
  } catch (err) {
    console.error('Error handling project44 event:', err);
    // project44 does not retry 500 but does retry 503, so signal a transient failure.
    return NextResponse.json({ error: 'Handler error' }, { status: 503 });
  }

  return NextResponse.json({ received: true });
}

// The webhook method is configurable in project44 (POST by default), so accept all four.
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
