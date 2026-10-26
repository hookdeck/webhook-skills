// Generated with: grist-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyGristRequest } from '../../../lib/verify-grist';

// Grist payloads have no event field: the event types (add, update) are set in the
// webhook's config, and the body is a JSON array of row objects (id plus column values).
// Rows arrive batched and Grist retries until success, so keep this idempotent.
function handleRows(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    console.log(`Grist row ${row.id} received`);
    // TODO: upsert the row into your system, keyed on row.id
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyGristRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let rows: unknown;
  try {
    // Read the raw text so any content type works.
    rows = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const isRow = (r: unknown) => !!r && typeof r === 'object' && !Array.isArray(r);
  if (!Array.isArray(rows) || !rows.every(isRow)) {
    return NextResponse.json({ error: 'Expected a JSON array of row objects' }, { status: 400 });
  }

  try {
    handleRows(rows as Record<string, unknown>[]);
  } catch (err) {
    console.error('Error handling Grist webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, rows: rows.length });
}
