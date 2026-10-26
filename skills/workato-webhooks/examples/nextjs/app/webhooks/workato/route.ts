// Generated with: workato-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkatoRequest } from '../../../lib/verify-workato';

/**
 * Workato has no built-in webhook events: the payload is whatever the recipe's
 * HTTP action sends. These examples assume { "event": "...", "data": {...} }.
 */
interface WorkatoPayload {
  event?: string;
  data?: Record<string, unknown>;
}

function handleEvent(payload: WorkatoPayload): void {
  const { event, data = {} } = payload;

  switch (event) {
    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'record.updated':
      console.log(`Record updated: ${data.record_id}`);
      // TODO: sync the record
      break;

    case 'recipe.failed':
      console.log(`Recipe failed: ${data.recipe_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyWorkatoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  // GET and DELETE usually have no body; that's fine.
  const raw = await request.text();
  let payload: unknown = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
  }

  try {
    handleEvent(payload as WorkatoPayload);
  } catch (err) {
    console.error('Error handling Workato request:', err);
    // A non-2xx fails the recipe step (and retries, if the step has retries on).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The request method is chosen in the Workato recipe, so accept all of these.
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
