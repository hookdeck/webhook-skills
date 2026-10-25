// Generated with: firstbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirstbaseRequest } from '../../../lib/verify-firstbase';

interface FirstbasePayload {
  eventType?: string;
  id?: string;
  [key: string]: unknown;
}

function handleEvent(payload: FirstbasePayload): void {
  const { eventType } = payload;

  switch (eventType) {
    case 'CREATED':
      console.log(`Firstbase resource created: ${payload.id}`);
      // TODO: fetch the new order / return order / inventory order from the Firstbase API
      break;

    case 'UPDATED':
      console.log(`Firstbase resource updated: ${payload.id}`);
      // TODO: re-fetch the resource and sync your records
      break;

    case 'DELETED':
      console.log(`Firstbase resource deleted: ${payload.id}`);
      // TODO: remove or archive the resource locally
      break;

    default:
      console.log(`Unhandled eventType: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFirstbaseRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as FirstbasePayload);
  } catch (err) {
    console.error('Error handling Firstbase event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
