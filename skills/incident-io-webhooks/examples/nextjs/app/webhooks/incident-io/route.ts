// Generated with: incident-io-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { handleEvent, secretToKey, toleranceFromEnv, verifyIncidentIoSignature } from '../../../lib/incident-io';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const key = secretToKey(process.env.INCIDENT_IO_WEBHOOK_SECRET);
  if (!key) {
    console.error('INCIDENT_IO_WEBHOOK_SECRET is missing or malformed');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the RAW body: verification needs the exact bytes incident.io signed
  const rawBody = Buffer.from(await request.arrayBuffer());

  const webhookId = request.headers.get('webhook-id');
  const result = verifyIncidentIoSignature(
    rawBody,
    {
      id: webhookId,
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
    key,
    toleranceFromEnv()
  );
  if (!result.ok) {
    console.error('incident.io webhook verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Parse only after the signature checks out
  let body: any;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body?.event_type;
  if (typeof eventType !== 'string') {
    return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
  }
  const resource = body[eventType]; // NOT body.data: the key is the event type string

  // webhook-id is stable across retries: deduplicate on it
  console.log(`Received incident.io webhook ${webhookId}: ${eventType}`);
  handleEvent(eventType, resource);

  return NextResponse.json({ received: true, eventType });
}
