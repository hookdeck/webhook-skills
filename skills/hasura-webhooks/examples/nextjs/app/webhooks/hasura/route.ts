// Generated with: hasura-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHasuraRequest } from '../../../lib/verify-hasura';

interface HasuraPayload {
  id?: string;
  event: {
    op: string;
    data?: { old?: Record<string, unknown> | null; new?: Record<string, unknown> | null };
    [key: string]: unknown;
  };
  table?: { schema?: string; name?: string };
  trigger?: { name?: string };
  [key: string]: unknown;
}

function handleEvent(payload: HasuraPayload): void {
  const { event, table, trigger, id } = payload;
  const where = `${table?.schema}.${table?.name}`;

  switch (event.op) {
    case 'INSERT':
      console.log(`Row inserted into ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.new
      break;

    case 'UPDATE':
      console.log(`Row updated in ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: compare event.data.old and event.data.new
      break;

    case 'DELETE':
      console.log(`Row deleted from ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.old
      break;

    case 'MANUAL':
      console.log(`Manual invocation for ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.new
      break;

    default:
      console.log(`Unhandled op: ${event.op}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyHasuraRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const p = payload as HasuraPayload | null;
  if (
    !p || typeof p !== 'object' || Array.isArray(p) ||
    !p.event || typeof p.event !== 'object' || typeof p.event.op !== 'string'
  ) {
    return NextResponse.json({ error: 'Expected an Event Trigger payload with event.op' }, { status: 400 });
  }

  try {
    handleEvent(p);
  } catch (err) {
    console.error('Error handling Hasura event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
