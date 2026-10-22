// Generated with: hightouch-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHightouchRequest } from '../../../lib/verify-hightouch';

// Each sync trigger (rows added / changed / removed) picks its own method and payload,
// and the trigger is not written into the request. A common convention maps the method
// back to the trigger; adjust it to match how you configured the sync.
const TRIGGERS: Record<string, string> = {
  POST: 'row_added',
  PUT: 'row_changed',
  PATCH: 'row_changed',
  DELETE: 'row_removed',
};

function handleRequest(method: string, payload: unknown): string {
  // With batching enabled the body is an array of rows (or an object wrapping one).
  const trigger = TRIGGERS[method] ?? 'unmapped';

  switch (trigger) {
    case 'row_added':
      console.log('Rows added:', JSON.stringify(payload));
      // TODO: create the record(s) in your system
      break;

    case 'row_changed':
      console.log('Rows changed:', JSON.stringify(payload));
      // TODO: update the record(s)
      break;

    case 'row_removed':
      console.log('Rows removed:', JSON.stringify(payload));
      // TODO: delete the record(s)
      break;

    default:
      console.log(`Unmapped ${method} request:`, JSON.stringify(payload));
  }

  return trigger;
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyHightouchRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credential header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; an empty body (e.g. GET) is fine.
  const raw = await request.text();
  let payload: unknown = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  try {
    const trigger = handleRequest(request.method, payload);
    return NextResponse.json({ received: true, trigger });
  } catch (err) {
    console.error('Error handling Hightouch request:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

// The HTTP Request destination supports GET, POST, PUT, PATCH and DELETE.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
