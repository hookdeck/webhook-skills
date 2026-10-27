// Generated with: katana-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKatanaSignature } from '../../../lib/verify-katana';

interface KatanaPayload {
  resource_type?: string;
  action?: string;
  object?: { id?: number | string; status?: string; href?: string };
  [key: string]: unknown;
}

// Dispatch on the top-level `action` field. `object` only holds id, status and href.
function handleEvent(payload: KatanaPayload): void {
  const { action, object } = payload;

  switch (action) {
    case 'sales_order.created':
      console.log(`Sales order created: ${object?.id}`);
      // TODO: fetch the order from object.href and sync it
      break;

    case 'sales_order.delivered':
      console.log(`Sales order delivered: ${object?.id}`);
      // TODO: send a shipping confirmation
      break;

    case 'purchase_order.received':
      console.log(`Purchase order received: ${object?.id}`);
      // TODO: update inbound stock
      break;

    case 'manufacturing_order.done':
      console.log(`Manufacturing order done: ${object?.id}`);
      // TODO: update finished-goods inventory
      break;

    case 'inventory.product_out_of_stock':
      console.log(`Product out of stock: ${object?.id}`);
      // TODO: trigger a reorder
      break;

    default:
      console.log(`Unhandled event: ${action}`);
  }
}

// Katana's docs don't name the HTTP method, so the same handler serves all five.
async function handle(request: NextRequest) {
  // Raw bytes, exactly as received. A request with no body (e.g. GET) is verified over zero bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyKatanaSignature(rawBody, request.headers.get('x-sha2-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  // A verified request with no body (e.g. a GET) carries no event: acknowledge it.
  if (rawBody.length === 0) return NextResponse.json({ received: true });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as KatanaPayload);
  } catch (err) {
    console.error('Error handling Katana webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
