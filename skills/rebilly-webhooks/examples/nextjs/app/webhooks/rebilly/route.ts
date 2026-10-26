// Generated with: rebilly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRebillyRequest } from '../../../lib/verify-rebilly';

// GET and DELETE webhooks carry no body and must never be cached.
export const dynamic = 'force-dynamic';

interface RebillyPayload {
  eventType?: string;
  [key: string]: unknown;
}

function handleEvent(payload: RebillyPayload): void {
  const { eventType } = payload;

  switch (eventType) {
    case 'transaction-processed':
      console.log(`Transaction processed`);
      // TODO: fulfil the order, inspect payload._embedded.transaction
      break;

    case 'transaction-declined':
      console.log(`Transaction declined`);
      // TODO: notify the customer or retry with another payment instrument
      break;

    case 'customer-created':
      console.log(`Customer created`);
      // TODO: create the matching account in your system
      break;

    case 'subscription-activated':
      console.log(`Subscription activated`);
      // TODO: grant access
      break;

    case 'subscription-canceled':
      console.log(`Subscription canceled`);
      // TODO: schedule access removal
      break;

    case 'invoice-issued':
      console.log(`Invoice issued`);
      // TODO: email or store the invoice
      break;

    case 'invoice-paid':
      console.log(`Invoice paid`);
      // TODO: mark the order as paid
      break;

    case 'data-export-completed':
      console.log(`Data export completed: ${payload.dataExportId}`);
      // TODO: download the file from the "download" link in payload._links
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Rebilly sends GET, POST, PUT, PATCH or DELETE, as configured on the webhook, so every
// method runs the same handler.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body. Hookdeck never sends a 401 challenge,
  // so the credentials must arrive with every request.
  if (!verifyRebillyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing basic auth credentials' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();
  if (raw.trim() === '') {
    // GET and DELETE webhooks (or an empty body template) carry no payload.
    return NextResponse.json({ received: true }, { status: 200 });
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
    handleEvent(payload as RebillyPayload);
  } catch (err) {
    console.error('Error handling Rebilly event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Rebilly retries unless the response is exactly HTTP 200, within 20 seconds.
  return NextResponse.json({ received: true }, { status: 200 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
