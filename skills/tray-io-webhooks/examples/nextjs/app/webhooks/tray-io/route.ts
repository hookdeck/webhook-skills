// Generated with: tray-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTrayRequest } from '../../../lib/verify-tray-io';

interface TrayPayload {
  event?: string;
  data?: unknown;
  [key: string]: unknown;
}

// The "event" field is a convention: Tray defines no event types.
function handleEvent(payload: TrayPayload): void {
  const { event, data } = payload;

  switch (event) {
    case 'record.created':
      console.log('Record created:', data);
      // TODO: create the record in your system
      break;

    case 'record.updated':
      console.log('Record updated:', data);
      // TODO: update the record in your system
      break;

    case 'record.deleted':
      console.log('Record deleted:', data);
      // TODO: remove the record from your system
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTrayRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credential header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET has an empty body.
  const raw = await request.text();
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
    handleEvent(payload as TrayPayload);
  } catch (err) {
    console.error('Error handling Tray.io request:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The method is chosen in the workflow, so accept all of them.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
