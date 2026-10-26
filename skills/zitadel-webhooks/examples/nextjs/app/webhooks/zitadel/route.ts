// Generated with: zitadel-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyZitadel } from '../../../lib/zitadel';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// event_payload is documented as base64-encoded JSON; accept an already-decoded object too.
function decodeEventPayload(value: unknown): JsonObject {
  if (isObject(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return isObject(decoded) ? decoded : {};
  } catch {
    return {};
  }
}

function handleEvent(payload: JsonObject, eventType: string) {
  const eventPayload = decodeEventPayload(payload.event_payload);
  const aggregate = `${str(payload.aggregateType) ?? '?'}/${str(payload.aggregateID) ?? '?'}`;

  switch (eventType) {
    case 'user.human.added':
      console.log(`Human user added (${aggregate}): ${str(eventPayload.userName) ?? 'unknown'}`);
      break;
    case 'session.added':
      console.log(`Session added (${aggregate})`);
      break;
    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ZITADEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZITADEL_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers the exact body ZITADEL sent, so read before any JSON parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyZitadel(rawBody, request.headers.get('zitadel-signature'), secret)) {
    console.error('ZITADEL webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Verified. Everything in the body is still untrusted input: check types before using a field.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // Event executions carry event_type, request/response executions carry fullMethod,
  // function executions carry function. Dispatch on whichever is present.
  const eventType = str(payload.event_type);
  const fullMethod = str(payload.fullMethod);
  const fn = str(payload.function);
  if (eventType !== undefined) {
    handleEvent(payload, eventType);
  } else if (fullMethod !== undefined) {
    console.log(`Request/response execution: ${fullMethod}`);
  } else if (fn !== undefined) {
    console.log(`Function execution: ${fn}`);
  } else {
    console.log('Unhandled ZITADEL payload');
  }

  return NextResponse.json({ received: true });
}
