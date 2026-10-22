// Generated with: paragon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyParagonRequest } from '../../../lib/verify-paragon';

interface ParagonPayload {
  type?: string;
  message?: string;
  [key: string]: unknown;
}

function handleEvent(payload: ParagonPayload): void {
  const { type, message } = payload;

  switch (type) {
    case 'workflow_failure':
      console.log(`Workflow failed: ${message}`);
      // TODO: alert the team (payload.workflow, payload.user, payload.data.error, payload.data.executionUrl)
      break;

    case 'credentials_failure':
      console.log(`Credential failed: ${message}`);
      // TODO: ask payload.user.id to reconnect payload.integration.type in your Connect Portal
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyParagonRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
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
    handleEvent(payload as ParagonPayload);
  } catch (err) {
    console.error('Error handling Paragon event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
