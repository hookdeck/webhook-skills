// Generated with: cartesia-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCartesiaRequest } from '../../../lib/verify-cartesia';

interface CartesiaEvent {
  type?: string;
  call_id?: string;
  agent_id?: string;
  webhook_id?: string;
  webhook_request_id?: string;
  timestamp?: string;
  call?: { end_reason?: string; error_message?: string; transcript?: unknown[] };
  turn?: { id?: number; role?: string; text?: string };
  analysis?: { summary?: string };
}

// Cartesia retries a failed delivery, so the same event can arrive more than once.
// webhook_request_id is stable across retries. Use a shared store (Redis, DB) in production.
const processed = new Set<string>();

function handleEvent(event: CartesiaEvent): void {
  switch (event.type) {
    case 'call_started':
      console.log(`Call started: ${event.call_id} (agent ${event.agent_id})`);
      // TODO: open a call record
      break;

    case 'call_completed':
      console.log(`Call completed: ${event.call_id} (${event.call?.end_reason})`);
      // TODO: store the transcript in event.call.transcript
      break;

    case 'call_failed':
      console.log(`Call failed: ${event.call_id} (${event.call?.error_message})`);
      // TODO: alert the owning team
      break;

    case 'call_turn':
      console.log(`Turn ${event.turn?.id} (${event.turn?.role}): ${event.turn?.text}`);
      // TODO: stream the turn to a live dashboard
      break;

    case 'post_call_analysis':
      console.log(`Call summary: ${event.analysis?.summary}`);
      // TODO: attach the summary to the call record
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body, whatever the content type.
  if (!verifyCartesiaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-webhook-secret' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const event = payload as CartesiaEvent;
  const requestId = event.webhook_request_id;
  if (requestId && processed.has(requestId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Cartesia event:', err);
    // 5xx is retried by Cartesia (up to 3 attempts).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (requestId) processed.add(requestId);
  return NextResponse.json({ received: true });
}
