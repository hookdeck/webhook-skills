// Generated with: people-data-labs-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPdlRequest } from '../../../lib/verify-pdl';

// The payload is a JSON array of PDL IDs (up to 1,000) for records updated in a release.
function handleEvent(ids: string[]): void {
  console.log(`Person record update batch: ${ids.length} ids`);
  // TODO: dedupe (an ID repeats when several filters match), store the IDs,
  // then re-enrich them with the Person Enrichment API
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPdlRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(payload) || !payload.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Expected a JSON array of PDL ids' }, { status: 400 });
  }

  try {
    handleEvent(payload as string[]);
  } catch (err) {
    console.error('Error handling People Data Labs batch:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
