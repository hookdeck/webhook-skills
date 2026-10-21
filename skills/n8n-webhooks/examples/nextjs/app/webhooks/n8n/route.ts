// Generated with: n8n-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyN8nRequest } from '../../../lib/verify-n8n';

/**
 * n8n has no built-in event types: the payload is whatever your workflow sends.
 * These examples assume the workflow sends { "event": "...", "id": "...", "data": {...} }.
 */
interface N8nPayload {
  event?: string;
  id?: string;
  data?: Record<string, unknown>;
}

function handleEvent(payload: N8nPayload): void {
  const { event, id, data = {} } = payload;

  switch (event) {
    case 'lead.created':
      console.log(`Lead created: ${data.email}`);
      // TODO: add the lead to your CRM
      break;

    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'workflow.completed':
      console.log(`Workflow completed: ${data.workflow_name}`);
      // TODO: mark the job as done
      break;

    case 'workflow.failed':
      console.log(`Workflow failed: ${data.workflow_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event} (id: ${id})`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyN8nRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
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

  try {
    handleEvent(payload as N8nPayload);
  } catch (err) {
    console.error('Error handling n8n event:', err);
    // A non-2xx makes the n8n HTTP Request node fail (and retry, if Retry On Fail is on).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
