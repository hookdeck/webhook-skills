// Generated with: kobotoolbox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyKoboRequest } from '../../../lib/verify-kobotoolbox';

// A REST Service fires once per new submission. There is no event type: the body
// is the submission (JSON or XML, optionally a subset of fields or a custom wrapper).
function handleSubmission(body: unknown, format: 'json' | 'xml/text'): void {
  if (format === 'json' && body && typeof body === 'object' && !Array.isArray(body)) {
    const s = body as Record<string, unknown>;
    console.log(`New submission ${s._id} (${s._xform_id_string}) at ${s._submission_time}`);
    // TODO: store the submission; use s._uuid or s._id to deduplicate retries
  } else {
    console.log(`New submission (${format}, ${String(body).length} chars)`);
    // TODO: parse the XML submission (or your custom wrapper) with your XML library
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyKoboRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="kobotoolbox"' } }
    );
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();

  // JSON when it parses as JSON; otherwise keep the raw text (XML format).
  let body: unknown = raw;
  let format: 'json' | 'xml/text' = 'xml/text';
  try {
    body = JSON.parse(raw);
    format = 'json';
  } catch {
    // not JSON: leave as raw text
  }

  try {
    handleSubmission(body, format);
  } catch (err) {
    console.error('Error handling KoboToolbox submission:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
