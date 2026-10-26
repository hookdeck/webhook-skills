// Generated with: sahha-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifySahhaSignature } from '../../../lib/sahha';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Every field of the parsed body is untrusted: check types before reading.
function handleEvent(eventType: string, externalId: string | undefined, payload: JsonObject) {
  switch (eventType) {
    case 'ScoreCreatedIntegrationEvent':
      console.log(`Score for ${externalId}: ${str(payload.type)} = ${payload.score} (${str(payload.state)})`);
      break;
    case 'BiomarkerCreatedIntegrationEvent':
      console.log(
        `Biomarker for ${externalId}: ${str(payload.type)} = ${str(payload.value)} ${str(payload.unit) ?? ''}`
      );
      break;
    case 'ArchetypeCreatedIntegrationEvent':
      console.log(`Archetype for ${externalId}: ${str(payload.name)} = ${str(payload.value)}`);
      break;
    case 'TagReceivedIntegrationEvent':
      console.log(`Tag for ${externalId}: ${str(payload.name)} (${str(payload.type)})`);
      break;
    case 'DataLogReceivedIntegrationEvent': {
      const logs = Array.isArray(payload.dataLogs) ? payload.dataLogs.filter(isObject) : [];
      console.log(`Data logs for ${externalId}: ${logs.length} ${str(payload.dataType)} sample(s)`);
      break;
    }
    default:
      console.log(`Unhandled Sahha event type: ${eventType}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.SAHHA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SAHHA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes; never request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySahhaSignature(rawBody, request.headers.get('x-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Unexpected payload shape' }, { status: 400 });
  }

  const eventType = request.headers.get('x-event-type');
  if (!eventType) {
    return NextResponse.json({ error: 'Missing X-Event-Type header' }, { status: 400 });
  }

  try {
    // Sahha needs a 2xx within 30 seconds; enqueue heavy work in production.
    // Retries and out-of-order delivery are possible: make handlers idempotent.
    handleEvent(eventType, request.headers.get('x-external-id') ?? str(payload.externalId), payload);
  } catch (err) {
    console.error('Error handling Sahha event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
