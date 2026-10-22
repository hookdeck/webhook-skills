// Generated with: prefect-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPrefectRequest } from '../../../lib/verify-prefect';

// Prefect adds no event field: the body is whatever json_data / form_data template you
// configured on the block, with {{subject}}, {{body}} and {{name}} substituted. This
// example assumes an illustrative template:
//   {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
interface PrefectNotification {
  subject?: string;
  body?: string;
  name?: string;
  [key: string]: unknown;
}

function handleNotification(payload: PrefectNotification): void {
  const { subject, body, name } = payload;
  console.log(`Prefect notification from "${name}": ${subject}`);
  console.log(body);
  // TODO: route by your own convention, e.g. match subject text or add a field to the template
}

// Parse only after the credential check. Empty bodies (e.g. GET) are valid.
function parseBody(text: string, contentType: string): PrefectNotification {
  if (!text.trim()) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object');
  }
  return parsed;
}

// The block's method is configurable (POST by default), so accept all of these.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPrefectRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let payload: PrefectNotification;
  try {
    // Read as text so any content type is accepted.
    payload = parseBody(await request.text(), request.headers.get('content-type') ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    handleNotification(payload);
  } catch (err) {
    console.error('Error handling Prefect notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
