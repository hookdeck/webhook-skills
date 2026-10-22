// Generated with: braze-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBrazeRequest } from '../../../lib/verify-braze';

type ParsedBody =
  | { kind: 'empty'; body: null }
  | { kind: 'json'; body: unknown }
  | { kind: 'text'; body: string };

/** The body is whatever the marketer composed: JSON, raw text (XML, form data) or nothing (GET). */
function parseBody(text: string): ParsedBody {
  if (text.trim() === '') return { kind: 'empty', body: null };
  try {
    return { kind: 'json', body: JSON.parse(text) };
  } catch {
    return { kind: 'text', body: text };
  }
}

function handleRequest(method: string, parsed: ParsedBody): void {
  switch (parsed.kind) {
    case 'json':
      // Braze adds no event field. Illustrative body: {"message_body": "Your order just arrived!", "user_id": "u_123"}
      console.log(`Braze ${method} with JSON body:`, parsed.body);
      // TODO: act on the keys your campaign or Canvas step composes
      break;
    case 'text':
      console.log(`Braze ${method} with text body: ${parsed.body.slice(0, 200)}`);
      // TODO: parse the raw text format your message uses (XML, form data, ...)
      break;
    default:
      console.log(`Braze ${method} with no body`);
  }
}

// Braze lets the marketer pick the HTTP method, so one handler serves all of them.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBrazeRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="braze-webhook"' } }
    );
  }

  // Read as text so any content type is accepted; GET yields an empty string.
  const parsed = parseBody(await request.text());

  try {
    handleRequest(request.method, parsed);
  } catch (err) {
    console.error('Error handling Braze webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
