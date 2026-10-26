// Generated with: vtex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyVtexRequest } from '../../../lib/verify-vtex';

interface VtexPayload {
  Domain?: string;
  OrderId?: string;
  State?: string;
  LastChange?: string;
  Origin?: { Account?: string; Key?: string };
  hookConfig?: string;
  [key: string]: unknown;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is VtexPayload {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function handleEvent(payload: VtexPayload): void {
  const { OrderId, State } = payload;

  switch (State) {
    case 'order-created':
      console.log(`Order created: ${OrderId}`);
      // TODO: create the order in your ERP
      break;

    case 'on-order-completed':
      console.log(`Order completed: ${OrderId}`);
      // TODO: confirm the order downstream
      break;

    case 'payment-pending':
      console.log(`Payment pending: ${OrderId}`);
      // TODO: hold fulfillment
      break;

    case 'payment-approved':
      console.log(`Payment approved: ${OrderId}`);
      // TODO: release the order for fulfillment
      break;

    case 'waiting-ffmt-authorization':
      console.log(`Waiting for fulfillment authorization: ${OrderId}`);
      // TODO: approve or reject fulfillment
      break;

    case 'ready-for-handling':
      console.log(`Ready for handling: ${OrderId}`);
      // TODO: create a pick/pack task
      break;

    case 'start-handling':
      console.log(`Start handling: ${OrderId}`);
      // TODO: reserve stock
      break;

    case 'handling':
      console.log(`Handling: ${OrderId}`);
      // TODO: update tracking status
      break;

    case 'invoiced':
      console.log(`Invoiced: ${OrderId}`);
      // TODO: send the invoice, trigger shipping
      break;

    case 'cancel':
      console.log(`Cancel: ${OrderId}`);
      // TODO: stop fulfillment
      break;

    case 'canceled':
      console.log(`Canceled: ${OrderId}`);
      // TODO: restock and refund
      break;

    default:
      console.log(`Unhandled state: ${State}`);
  }
}

export async function POST(request: NextRequest) {
  // Read as text so any content type is accepted.
  const raw = await request.text();

  // Setup ping: answer 200 before the auth check (the docs don't say if it carries headers).
  const parsed = parseJson(raw);
  if (isObject(parsed) && parsed.hookConfig === 'ping') {
    return NextResponse.json({ received: true });
  }

  if (!verifyVtexRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  if (!isObject(parsed)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(parsed);
  } catch (err) {
    console.error('Error handling VTEX event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
