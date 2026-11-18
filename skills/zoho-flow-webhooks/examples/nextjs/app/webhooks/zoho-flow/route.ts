// Generated with: zoho-flow-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { parsePayload, verifyZohoFlowRequest, type Payload } from '../../../lib/verify-zoho-flow';

interface FlowPayload {
  event?: string;
  email?: string;
  deal_id?: string;
  [key: string]: unknown;
}

/**
 * Flow adds no event name. These examples assume an illustrative body with an
 * `event` field you add on the action, e.g.
 *   {"event": "form.submitted", "name": "...", "email": "..."}
 */
function handlePayload(method: string, payload: Payload): void {
  if (payload.format === 'text' || !payload.data || typeof payload.data !== 'object') {
    console.log(`Zoho Flow ${method} with a ${payload.format} body`);
    return;
  }
  const data = payload.data as FlowPayload;
  switch (data.event) {
    case 'form.submitted':
      console.log(`Form submitted by ${data.email}`);
      // Create the user or lead in your system
      break;
    case 'deal.won':
      console.log(`Deal ${data.deal_id} won`);
      // Start provisioning or invoicing
      break;
    default:
      console.log(`Zoho Flow ${method} with event ${data.event}`);
  }
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.ZOHO_FLOW_WEBHOOK_SECRET) {
    console.error('ZOHO_FLOW_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Authenticate before reading or parsing the body.
  if (!verifyZohoFlowRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  const payload = parsePayload(raw, request.headers.get('content-type') || '', new URL(request.url).searchParams);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    handlePayload(request.method, payload);
  } catch (err) {
    console.error('Error handling Zoho Flow webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // With the action's Response Type set to JSON or Auto, these keys become variables.
  return NextResponse.json({ received: true });
}

// The Send Webhook action's method is user-chosen.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
