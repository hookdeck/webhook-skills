// Generated with: make-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMakeRequest } from '../../../lib/verify-make';

/**
 * Make has no built-in event types: the payload is whatever your scenario maps.
 * These examples assume { "event": "...", "id": "...", "data": {...} }.
 */
interface MakePayload {
  event?: string;
  id?: string;
  data?: Record<string, unknown>;
}

function handleEvent(payload: MakePayload): void {
  const { event, id, data = {} } = payload;

  switch (event) {
    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'lead.created':
      console.log(`Lead created: ${data.email}`);
      // TODO: add the lead to your CRM
      break;

    case 'scenario.completed':
      console.log(`Scenario completed: ${data.scenario_name}`);
      // TODO: mark the job as done
      break;

    case 'scenario.failed':
      console.log(`Scenario failed: ${data.scenario_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event} (id: ${id})`);
  }
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMakeRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  // Read the raw text (any content type). GET requests arrive with no body.
  const raw = await request.text();

  // An empty body (e.g. GET) is valid: there is simply no event to dispatch.
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
    handleEvent(payload as MakePayload);
  } catch (err) {
    console.error('Error handling Make event:', err);
    // A non-2xx makes the HTTP module error, which stops the scenario run
    // unless an error handler route is attached.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The HTTP module's method is user-chosen, so serve all the usual ones.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
