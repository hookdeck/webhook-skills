// Generated with: nexthink-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNexthinkRequest } from '../../../lib/verify-nexthink';

/**
 * Nexthink adds no event field: the body is the JSON template you wrote on the webhook.
 * This example uses an ILLUSTRATIVE template where `event` is a field you chose:
 *   { "event": "alert triggered", "monitor": "{{alert.monitor.name}}" }
 */
function handleEvent(payload: unknown): void {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  switch (body.event) {
    case 'alert triggered':
      console.log(`Alert triggered: ${body.monitor}`);
      // TODO: open a ticket or notify the on-call channel
      break;

    case 'alert recovered':
      console.log(`Alert recovered: ${body.monitor}`);
      // TODO: resolve the ticket
      break;

    default:
      console.log('Unrecognised Nexthink payload (no matching "event" in your template)');
  }
}

async function handleWebhook(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNexthinkRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  // Read the raw text so any content type works. The body may be empty.
  const raw = await request.text();
  let payload: unknown = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Nexthink webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// The request method is chosen on the Nexthink webhook: POST, PUT or PATCH.
export async function POST(request: NextRequest) {
  return handleWebhook(request);
}

export async function PUT(request: NextRequest) {
  return handleWebhook(request);
}

export async function PATCH(request: NextRequest) {
  return handleWebhook(request);
}
