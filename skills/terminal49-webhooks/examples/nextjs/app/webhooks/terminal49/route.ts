// Generated with: terminal49-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTerminal49Signature } from '../../../lib/verify-terminal49';

interface JsonApiResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
}

interface Terminal49Notification {
  data: {
    id?: string;
    type?: string; // always "webhook_notification"
    attributes: { event: string; [key: string]: unknown };
    relationships?: { reference_object?: { data?: { id?: string; type?: string } } };
  };
  included?: JsonApiResource[];
}

// In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
const processedNotificationIds = new Set<string>();

function handleNotification(payload: Terminal49Notification): void {
  const { data, included = [] } = payload;
  const event = data.attributes.event;
  const referenceType = data.relationships?.reference_object?.data?.type;

  switch (event) {
    case 'tracking_request.succeeded':
    case 'tracking_request.failed': {
      const trackingRequest = included.find((r) => r.type === 'tracking_request');
      console.log(`${event} (${referenceType}) ${trackingRequest?.attributes?.request_number ?? ''}`);
      // TODO: mark the tracking request done, or surface request.attributes.failed_reason
      break;
    }

    case 'container.transport.vessel_arrived':
    case 'container.transport.vessel_departed':
    case 'container.transport.available': {
      const container = included.find((r) => r.type === 'container');
      console.log(`${event} for container ${container?.attributes?.number}`);
      // TODO: update your container milestone from the transport_event in `included`
      break;
    }

    case 'container.updated':
    case 'shipment.estimated.arrival':
      console.log(`${event} (${referenceType})`);
      // TODO: re-fetch the container or shipment from the REST API for the latest ETA/state
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // arrayBuffer() gives the exact bytes whatever the content type is; verify before parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-t49-webhook-signature');

  if (!verifyTerminal49Signature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid or missing X-T49-Webhook-Signature' }, { status: 401 });
  }

  let payload: Terminal49Notification;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = payload?.data;
  if (!data || typeof data.attributes?.event !== 'string') {
    return NextResponse.json({ error: 'Expected data.attributes.event' }, { status: 400 });
  }

  // Retries can deliver the same notification more than once: data.id is the idempotency key.
  if (data.id && processedNotificationIds.has(data.id)) {
    console.log(`Duplicate notification ${data.id}, skipping`);
    return NextResponse.json({ received: true });
  }

  try {
    handleNotification(payload);
    if (data.id) processedNotificationIds.add(data.id);
  } catch (err) {
    console.error('Error handling Terminal49 notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 }); // Terminal49 retries non-2xx
  }

  return NextResponse.json({ received: true });
}
