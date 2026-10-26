// Generated with: redo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyRedoRequest } from '../../../lib/verify-redo';

function handleEvent(payload: Record<string, unknown>): void {
  const ret = (payload.return ?? {}) as { id?: string; status?: string };

  switch (classify(payload)) {
    case 'return.created':
      console.log(`Return ${ret.id} created (${ret.status})`);
      // TODO: open a ticket or notify the warehouse
      break;

    case 'return.updated':
      console.log(`Return ${ret.id} updated (${ret.status})`);
      // TODO: sync the return status; dedupe on return.id + payload.at
      break;

    case 'backfill':
      console.log(`Backfill event for return ${ret.id}`);
      // TODO: load history without triggering customer-facing side effects
      break;

    default:
      console.log(`Unhandled Redo event type: ${String(payload.type)}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRedoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Redo webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
