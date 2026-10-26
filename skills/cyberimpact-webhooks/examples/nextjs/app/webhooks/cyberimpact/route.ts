// Generated with: cyberimpact-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCyberimpactRequest } from '../../../lib/verify-cyberimpact';

interface CyberimpactPayload {
  id?: string;
  event?: string;
  timestamp?: string;
  idClient?: number;
  data?: { id?: number; email?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: CyberimpactPayload): void {
  const { event, data = {} } = payload;

  switch (event) {
    case 'automation.webhook.send':
      console.log(`Automation webhook for contact ${data.id} (${data.email})`);
      // TODO: add/update the contact in your CRM, send an alert, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCyberimpactRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
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
    handleEvent(payload as CyberimpactPayload);
  } catch (err) {
    console.error('Error handling Cyberimpact event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
