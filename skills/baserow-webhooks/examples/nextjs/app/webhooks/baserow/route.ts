// Generated with: baserow-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBaserowRequest } from '../../../lib/verify-baserow';

interface BaserowPayload {
  event_type?: string;
  event_id?: string;
  table_id?: number;
  items?: unknown[];
  [key: string]: unknown;
}

function handleEvent(payload: BaserowPayload): void {
  const { event_type: eventType, event_id: eventId } = payload;

  switch (eventType) {
    case 'rows.created':
      console.log(`Rows created (${eventId}): ${(payload.items || []).length} row(s)`);
      // TODO: sync payload.items to your system
      break;

    case 'rows.updated':
      console.log(`Rows updated (${eventId}): ${(payload.items || []).length} row(s)`);
      // TODO: apply payload.items changes
      break;

    case 'rows.deleted':
      console.log(`Rows deleted (${eventId})`);
      // TODO: remove the rows downstream
      break;

    case 'view.created':
    case 'view.updated':
    case 'view.deleted':
      console.log(`View event ${eventType} (${eventId})`);
      // TODO: audit the schema change (payload.view)
      break;

    case 'field.created':
    case 'field.updated':
    case 'field.deleted':
      console.log(`Field event ${eventType} (${eventId})`);
      // TODO: update your schema mirror (payload.field)
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// The sender chooses the method in Baserow, so every method is exported below.
async function handleWebhook(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBaserowRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; a body may be empty.
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
    handleEvent(payload as BaserowPayload);
  } catch (err) {
    console.error('Error handling Baserow event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const GET = handleWebhook;
export const DELETE = handleWebhook;

// GET handlers are static by default in some Next.js setups; this one reads headers per request.
export const dynamic = 'force-dynamic';
