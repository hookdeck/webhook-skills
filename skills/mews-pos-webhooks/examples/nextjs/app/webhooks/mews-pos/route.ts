// Generated with: mews-pos-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMewsPosSignature } from '../../../lib/verify-mews-pos';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function handleEvent(eventType: string, data: JsonObject): void {
  const id = typeof data.id === 'string' ? data.id : undefined;
  const attributes = isObject(data.attributes) ? data.attributes : {};

  switch (eventType) {
    case 'booking.status.updated':
      console.log(`Booking ${id} status: ${String(attributes.status)}`);
      // TODO: update table or guest state
      break;

    case 'order.state.updated':
      console.log(`Order ${id} state updated`);
      // TODO: sync the order lifecycle
      break;

    case 'order.status.updated':
      console.log(`Order ${id} status updated`);
      // TODO: refresh kitchen and front-of-house displays
      break;

    case 'order.total.updated':
      console.log(`Order ${id} total updated`);
      // TODO: reconcile totals
      break;

    case 'order.payments.added':
      console.log(`Payment added to order ${id}`);
      // TODO: record the payment for accounting
      break;

    case 'product.availability.updated':
      console.log(`Product ${id} availability updated`);
      // TODO: sync menu and stock
      break;

    default:
      console.log(`Unhandled Mews POS event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the raw bytes so any content type works and the exact body is verified.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyMewsPosSignature(rawBody, request.headers.get('x-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing X-Signature' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The body is untrusted: check each level before reading into it.
  if (!isObject(event) || !isObject(event.meta) || typeof event.meta.eventType !== 'string') {
    return NextResponse.json({ error: 'Expected { data, meta: { eventType } }' }, { status: 400 });
  }
  const data = isObject(event.data) ? event.data : {};

  try {
    handleEvent(event.meta.eventType, data);
  } catch (err) {
    console.error('Error handling Mews POS webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
