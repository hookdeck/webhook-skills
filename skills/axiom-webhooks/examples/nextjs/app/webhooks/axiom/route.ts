// Generated with: axiom-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAxiomRequest } from '../../../lib/verify-axiom';

// The body is a Go template the notifier's author writes. This type and the handler
// assume the default template: state in `action` (Open / Closed), data under `event`.
interface AxiomPayload {
  action?: string;
  event?: {
    monitorID?: string;
    title?: string;
    body?: string;
    value?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function handleEvent(payload: AxiomPayload): void {
  const { action, event = {} } = payload;

  switch (action) {
    case 'Open':
      console.log(`Monitor opened: ${event.title} (${event.monitorID})`);
      // TODO: page on-call or open an incident (event.body, event.value, event.matchedEvent)
      break;

    case 'Closed':
      console.log(`Monitor closed: ${event.title} (${event.monitorID})`);
      // TODO: resolve the matching incident
      break;

    default:
      console.log(`Unhandled action: ${action}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAxiomRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
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
    handleEvent(payload as AxiomPayload);
  } catch (err) {
    console.error('Error handling Axiom notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
