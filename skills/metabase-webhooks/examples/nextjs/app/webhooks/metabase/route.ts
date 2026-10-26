// Generated with: metabase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMetabaseRequest } from '../../../lib/verify-metabase';

interface MetabasePayload {
  type?: string;
  alert_id?: number | null;
  data?: {
    question_id?: number;
    question_name?: string;
    question_url?: string;
    visualization?: string;
    raw_data?: { cols?: string[]; rows?: unknown[][] };
  };
  [key: string]: unknown;
}

function handleEvent(payload: MetabasePayload): void {
  switch (payload.type) {
    case 'alert': {
      const { question_id, question_name, question_url, raw_data } = payload.data ?? {};
      const rows = Array.isArray(raw_data?.rows) ? raw_data.rows.length : 0;
      const test = payload.alert_id === null ? ' (test alert)' : '';
      console.log(`Alert${test}: ${question_name} (#${question_id}) returned ${rows} rows ${question_url}`);
      // TODO: forward to chat/on-call, store raw_data, or decode payload.data.visualization (base64 PNG)
      break;
    }

    default:
      console.log(`Unhandled event: ${payload.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMetabaseRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="metabase-webhook"' } }
    );
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
    handleEvent(payload as MetabasePayload);
  } catch (err) {
    console.error('Error handling Metabase event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
