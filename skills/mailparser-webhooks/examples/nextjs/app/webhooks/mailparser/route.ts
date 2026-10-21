// Generated with: mailparser-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { bodyHash, headerName, verifyMailparserHeader } from '../../../lib/mailparser';

export async function POST(request: NextRequest) {
  const expected = process.env.MAILPARSER_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error('MAILPARSER_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const name = headerName();
  const received = request.headers.get(name);
  if (!received) {
    return NextResponse.json({ error: `Missing ${name} header` }, { status: 401 });
  }
  if (!verifyMailparserHeader(received, expected)) {
    console.error(`Mailparser webhook ${name} header mismatch`);
    return NextResponse.json({ error: `Invalid ${name} header` }, { status: 401 });
  }

  // Authenticate first, then parse the raw body.
  const raw = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  console.log(`✓ Authenticated Mailparser webhook (${bodyHash(raw).slice(0, 12)})`);

  handleParsedEmail(payload as Record<string, unknown>);

  return NextResponse.json({ received: true });
}

/**
 * Mailparser has no event types: the body is the parsed data you defined in
 * the HTTP Body Payload Template, so field names are your parsing-rule names.
 */
function handleParsedEmail(payload: Record<string, unknown>) {
  // TODO: check bodyHash (or a unique parsed field) against your store and return if seen.
  const fields = Object.keys(payload);
  console.log(`📧 Parsed email data with ${fields.length} field(s): ${fields.join(', ')}`);
}
