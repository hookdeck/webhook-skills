// Generated with: fireberry-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFireberryRequest } from '../../../lib/verify-fireberry';

// Fireberry adds no event field: the body is free text written by the automation's author.
// This handler assumes an illustrative JSON body such as
//   {"event": "account.created", "record": {"accountname": "Acme"}}
interface FireberryPayload {
  event?: string;
  record?: { id?: string; accountname?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: FireberryPayload): void {
  const { event, record } = payload;

  switch (event) {
    case 'account.created':
      console.log(`Account created: ${record?.accountname}`);
      // TODO: sync the new account to your system
      break;

    case 'record.updated':
      console.log(`Record updated: ${record?.id}`);
      // TODO: apply the changed fields
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// The automation's author picks the HTTP method, so the same handler serves all five.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFireberryRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET requests have no body.
  const raw = await request.text();
  if (raw.trim() === '') {
    console.log(`${request.method} webhook with empty body`);
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
    handleEvent(payload as FireberryPayload);
  } catch (err) {
    console.error('Error handling Fireberry webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
