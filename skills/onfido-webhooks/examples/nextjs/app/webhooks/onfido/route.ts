// Generated with: onfido-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { WebhookEventVerifier } from '@onfido/api';

interface OnfidoEvent {
  payload: {
    resource_type: string;
    action: string;
    object?: { id?: string; status?: string; href?: string };
    resource?: Record<string, unknown>;
  };
}

// Verify X-SHA2-Signature (HMAC-SHA256 hex of the raw body, keyed with the webhook token).
// Returns the parsed event, or null if the signature is invalid.
function verifyOnfidoWebhook(rawBody: string, signature: string | null, token: string | undefined): OnfidoEvent | null {
  if (!signature || !token) return null;
  try {
    // readPayload throws on a bad signature (including wrong-length hex)
    return new WebhookEventVerifier(token).readPayload(Buffer.from(rawBody), signature) as OnfidoEvent;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Raw body is required: parsed JSON may be reordered and break the signature
  const rawBody = await request.text();
  const event = verifyOnfidoWebhook(
    rawBody,
    request.headers.get('x-sha2-signature'),
    process.env.ONFIDO_WEBHOOK_TOKEN
  );

  if (!event) {
    console.error('Onfido webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { resource_type: resourceType, action, object } = event.payload ?? {};

  switch (action) {
    case 'check.started':
      console.log(`Check started: ${object?.id}`);
      break;
    case 'check.completed':
      console.log(`Check completed: ${object?.id} (${object?.status})`);
      break;
    case 'report.completed':
      console.log(`Report completed: ${object?.id} (${object?.status})`);
      break;
    case 'workflow_task.started':
      console.log(`Workflow task started: ${object?.id}`);
      break;
    case 'workflow_task.completed':
      console.log(`Workflow task completed: ${object?.id}`);
      break;
    case 'workflow_run.completed':
      console.log(`Workflow run completed: ${object?.id} (${object?.status})`);
      break;
    default:
      console.log(`Unhandled Onfido event: ${resourceType} / ${action}`);
  }

  // Respond 2xx within 10 seconds or Onfido retries
  return NextResponse.json({ received: true });
}
