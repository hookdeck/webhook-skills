// Generated with: tanium-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTaniumRequest } from '../../../lib/verify-tanium';

/**
 * The body is whatever the Connect connection is configured to send (the rows of
 * its source, with the columns the author picked); there is no vendor event field.
 * A batched run may be a JSON array of records, otherwise an object.
 */
function handleRecords(payload: object): void {
  const records = Array.isArray(payload) ? payload : [payload];
  console.log(`Received ${records.length} record(s) from Tanium Connect`);
  // TODO: store or forward the records (e.g. records[0]['Computer Name'])
}

async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTaniumRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing authentication header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; an empty body is fine.
  const raw = await request.text();

  let payload: unknown = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (payload === null || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Expected a JSON object or array' }, { status: 400 });
    }
  }

  try {
    if (payload !== null) handleRecords(payload as object);
  } catch (err) {
    console.error('Error handling Tanium delivery:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The HTTP destination's method is user-chosen, so accept POST, PUT and PATCH.
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
