// Generated with: bringg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBringgRequest } from '../../../lib/verify-bringg';

/**
 * Every Bringg webhook body carries a webhook_type. Order (task) webhooks include the
 * order object; the exact fields depend on the webhook and any Flexible Webhook setup.
 */
interface BringgPayload {
  webhook_type?: string;
  id?: number;
  title?: string;
  [key: string]: unknown;
}

function handleEvent(payload: BringgPayload): void {
  const type = payload.webhook_type;

  switch (type) {
    case 'task_created':
      console.log(`Order created: ${payload.id} (${payload.title})`);
      // TODO: create the order in your OMS
      break;

    case 'task_done':
      console.log(`Order done: ${payload.id}`);
      // TODO: mark the order as delivered
      break;

    case 'task_cancelled':
      console.log(`Order cancelled: ${payload.id}`);
      // TODO: cancel the order downstream
      break;

    case 'driver_assigned':
      console.log(`Order assigned to driver: ${payload.id}`);
      // TODO: notify the customer
      break;

    case 'way_point_arrived':
      console.log('Driver arrived at destination');
      // TODO: send an "arrived" notification
      break;

    case 'note_created':
      console.log('Order attachment created');
      // TODO: store the note, photo or signature
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body (any content type is accepted).
  if (!verifyBringgRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as BringgPayload);
  } catch (err) {
    console.error('Error handling Bringg event:', err);
    // Bringg tries each webhook three times; unconfirmed ones land in its undelivered report.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
