// Generated with: crusoe-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Payload structure varies by event type, so treat every field as optional.
type CrusoePayload = Record<string, unknown> & {
  type?: unknown;
  event_type?: unknown;
  status?: string;
  workflow_type?: string;
  resource_id?: string;
  resource_name?: string;
  cluster_id?: string;
  cluster_name?: string;
  triggered_by?: { error_name?: string };
};

// Crusoe doesn't document an event-type field in the body (the event type is
// picked per endpoint in the Svix dashboard), so read one if present and
// otherwise recognise the documented remediation payload by its fields.
function getEventType(payload: CrusoePayload): string {
  if (typeof payload.type === 'string') return payload.type;
  if (typeof payload.event_type === 'string') return payload.event_type;
  if (payload.workflow_type && payload.resource_id) return 'resource.automated_remediation';
  return 'unknown';
}

export async function POST(request: Request) {
  const secret = process.env.CRUSOE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: never JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // Crusoe delivers through Svix: HMAC-SHA256 over "id.timestamp.body".
    // The SDK checks every v1 signature and a 5-minute timestamp window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    console.error('Webhook verification failed:', msg);
    const detail = /timestamp/i.test(msg) ? 'Invalid timestamp' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  let payload: CrusoePayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = getEventType(payload);
  console.log(`Received Crusoe webhook ${svixId}: ${eventType}`);

  switch (eventType) {
    case 'resource.automated_remediation':
      console.log('Automated remediation:', {
        status: payload.status,
        workflow: payload.workflow_type,
        resource: payload.resource_name ?? payload.resource_id,
        cluster: payload.cluster_name ?? payload.cluster_id,
        error: payload.triggered_by?.error_name,
      });
      break;
    default:
      // Budget, organization and Managed AI payloads aren't documented yet.
      console.log('Unhandled Crusoe notification, fields:', Object.keys(payload));
  }

  return NextResponse.json({ received: true, type: eventType }, { status: 200 });
}
