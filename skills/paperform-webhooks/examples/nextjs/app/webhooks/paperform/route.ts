// Generated with: paperform-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaperformRequest } from '../../../lib/verify-paperform';

interface PaperformQuestion {
  title: string;
  description: string | null;
  type: string;
  key: string;
  custom_key: string | null;
  value: unknown;
}

interface PaperformPayload {
  data: PaperformQuestion[];
  submission_id?: string;
  created_at?: string;
  ip_address?: string;
  charge?: unknown;
  [key: string]: unknown;
}

// Paperform has no event types: the trigger (New Submission or Partial Submission) is a
// per-webhook setting. This example reads an optional ?trigger=new|partial query parameter
// that you add to the webhook URL yourself.
function handleSubmission(payload: PaperformPayload, trigger: 'new' | 'partial'): void {
  const answers = Object.fromEntries(
    payload.data.map((q) => [q.custom_key || q.key, q.value])
  );

  if (trigger === 'partial') {
    console.log(`Partial submission ${payload.submission_id}`, answers);
    // TODO: follow up on the abandoned form
  } else {
    console.log(`New submission ${payload.submission_id}`, answers);
    // TODO: create a record, notify a team (payload.charge is set for payments)
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPaperformRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as PaperformPayload).data)) {
    return NextResponse.json({ error: 'Expected a JSON object with a data array' }, { status: 400 });
  }

  try {
    const trigger = request.nextUrl.searchParams.get('trigger') === 'partial' ? 'partial' : 'new';
    handleSubmission(payload as PaperformPayload, trigger);
  } catch (err) {
    console.error('Error handling Paperform submission:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
