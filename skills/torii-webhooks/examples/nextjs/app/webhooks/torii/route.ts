// Generated with: torii-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyToriiRequest } from '../../../lib/verify-torii';

// ILLUSTRATIVE ONLY: Torii adds no event field. The body is whatever JSON template
// your workflow defines; "workflow" here is a field we made up for this example.
function handleWorkflowRequest(method: string, payload: unknown): void {
  const body = (payload ?? {}) as Record<string, unknown>;

  switch (body.workflow) {
    case 'new app discovered':
      console.log(`[${method}] New app discovered:`, body.app);
      // TODO: open a review ticket for the app
      break;

    case 'user offboarding':
      console.log(`[${method}] User offboarding:`, body.user);
      // TODO: revoke access in downstream systems
      break;

    default:
      console.log(`[${method}] Workflow request:`, payload);
  }
}

// The workflow author picks the HTTP method, so one handler serves all of them.
async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyToriiRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credential header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; an empty body is valid.
  const text = await request.text();
  let payload: unknown = null;
  if (text.trim() !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  try {
    handleWorkflowRequest(request.method, payload);
  } catch (err) {
    console.error('Error handling Torii request:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
