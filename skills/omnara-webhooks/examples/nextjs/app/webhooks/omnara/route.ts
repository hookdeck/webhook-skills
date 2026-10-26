// Generated with: omnara-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Fail closed: never accept deliveries when no secret is configured
  const secret = process.env.OMNARA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OMNARA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    // Omnara only signs when event_webhook.signing_secret_id is set on the agent
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Omnara signed
  const rawBody = await request.text();

  let payload: Record<string, any>;
  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, entry and enforces
    // a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library strips a whsec_ prefix if present, otherwise base64-decodes the whole secret.
    // On success it returns the parsed JSON body, so there is no second parse.
    payload = new Webhook(secret).verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Omnara webhook verification failed:', message);
    // The signature was valid but the body is not JSON
    if (err instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  // Body: { event, data }. `event` is the event type; timeline events repeat it in data.event_kind.
  // Webhook-Id is stable across retries: deduplicate on it (and tool calls on data.tool_call_id).
  const event: string | undefined = payload?.event;
  const data = payload?.data ?? {};
  console.log(`Received Omnara webhook ${id}: ${event}`);

  switch (event) {
    case 'agent_input':
      console.log('Agent input:', data.agent_id, data.input_kind, data.turn_id);
      break;
    case 'model_output':
      console.log('Model output:', data.agent_id, data.stop_reason, data.turn_id);
      break;
    case 'tool_result':
      console.log('Tool result:', data.tool_call_id, data.outcome);
      break;
    case 'context_checkpoint':
      console.log('Context checkpoint:', data.context_checkpoint_id, data.summarized_through_event_sequence);
      break;
    case 'tool_call_update':
      // A notification to fetch the tool call: state snapshot only, no arguments.
      // For custom tool execution handle `ready` and deduplicate by tool_call_id.
      console.log('Tool call update:', data.tool_call_id, data.state, data.interaction_update?.state);
      break;
    default:
      // Return 2xx for events you don't handle, or Omnara keeps retrying them
      console.log('Unhandled event type:', event);
  }

  return NextResponse.json({ success: true, event });
}
