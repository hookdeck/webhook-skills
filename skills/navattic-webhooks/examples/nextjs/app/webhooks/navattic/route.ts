// Generated with: navattic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classifyData, verifyNavatticRequest } from '../../../lib/verify-navattic';

interface NavatticEvent {
  eventType?: string;
  timestamp?: string;
  data?: unknown;
}

function handleEvent(payload: NavatticEvent): void {
  switch (payload.eventType) {
    case 'session_closed': {
      const kind = classifyData(payload.data);
      if (kind === 'visitor') {
        const { session, endUser, companyAccount } = payload.data as Record<string, any>;
        console.log(
          `Visitor session closed at ${payload.timestamp}: ${session.mostRecentDemoName} ` +
            `(${endUser?.mostRecentEmail ?? 'unknown visitor'}, ${companyAccount?.name ?? 'no account'})`
        );
        // TODO: push the session to your CRM, notify sales
      } else if (kind === 'account') {
        const account = payload.data as Record<string, any>;
        console.log(`Account session closed at ${payload.timestamp}: ${account.name ?? account.id}`);
        // TODO: update the account in your system
      } else {
        console.log('session_closed with unrecognised data shape');
      }
      break;
    }

    default:
      console.log(`Unhandled Navattic event: ${payload.eventType}`);
  }
}

// Navattic's docs don't name the HTTP method, so every method shares this handler.
async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNavatticRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  // Read the raw text so any content type works.
  const raw = await request.text();
  if (raw.trim() === '') {
    // Authenticated request with no body: nothing to process.
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as NavatticEvent);
  } catch (err) {
    console.error('Error handling Navattic webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
