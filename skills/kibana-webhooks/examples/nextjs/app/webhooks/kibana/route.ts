// Generated with: kibana-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseBody, verifyBasicAuth } from '../../../lib/verify-kibana';

// The Kibana Webhook connector can use POST (default), PUT, PATCH, GET or DELETE.
async function handle(request: NextRequest) {
  // 1. Authenticate first, for every method
  if (!verifyBasicAuth(request.headers.get('authorization'))) {
    console.error('Kibana webhook authentication failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. The body may be empty (GET, DELETE). Parse JSON when it parses, otherwise keep the text.
  const text = await request.text();
  const payload = parseBody(text);

  // 3. Handle the rule action. The body is whatever your connector's mustache template renders.
  // ILLUSTRATIVE payload (not a vendor schema):
  //   {"rule": "{{rule.name}}", "status": "{{alert.actionGroup}}", "context": "{{context.message}}"}
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as { rule?: string; status?: string; context?: string };
    if (String(p.status).toLowerCase() === 'recovered') {
      console.log(`Rule recovered: ${p.rule}`);
      // TODO: resolve the incident, notify the channel
    } else {
      console.log(`Rule action fired: ${p.rule} (${p.status}): ${p.context}`);
      // TODO: open an incident, page on-call
    }
  } else {
    console.log(`Received ${request.method} with ${text ? 'non-JSON' : 'empty'} body`);
  }

  // 4. Acknowledge quickly with any 2XX
  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
