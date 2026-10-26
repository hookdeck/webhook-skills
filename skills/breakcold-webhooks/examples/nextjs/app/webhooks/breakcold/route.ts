// Generated with: breakcold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { isTimestampFresh, verifyBreakcoldSignature } from '../../../lib/breakcold';

interface BreakcoldEvent {
  eventId?: string;
  timestamp?: string;
  workspaceId?: string;
  event: string;
  data?: Record<string, any>;
}

// Deduplicate on X-Webhook-Delivery-Id. Use Redis/Postgres with a TTL in production.
const processedDeliveries = new Set<string>();

function handleEvent({ event, data = {} }: BreakcoldEvent) {
  switch (event) {
    case 'record.created':
      console.log(`[record.created] ${data.objectTypeName ?? data.objectType}: ${data.name} (${data.id})`);
      break;
    case 'record.updated':
      console.log(`[record.updated] ${data.name} (${data.id}) fields: ${Object.keys(data.fields ?? {}).join(', ')}`);
      break;
    case 'record.deleted':
      console.log(`[record.deleted] ${data.id}`);
      break;
    case 'note.created':
    case 'note.updated':
    case 'note.deleted':
      console.log(`[${event}] note ${data.noteId} on record ${data.recordId}: ${data.title}`);
      break;
    case 'task.created':
    case 'task.completed':
      console.log(`[${event}] task ${data.taskId} "${data.title}" on record ${data.recordId}`);
      break;
    case 'relation.added':
    case 'relation.removed':
      console.log(`[${event}] ${data.sourceRecordId} -> ${data.targetRecordId} via ${data.fieldSlug}`);
      break;
    case 'call.linked':
    case 'call.unlinked':
      console.log(`[${event}] call ${data.callId} "${data.meetingTitle}" on record ${data.recordId}`);
      break;
    case 'file.uploaded':
    case 'file.deleted':
      console.log(`[${event}] ${data.fileName} on record ${data.recordId}`);
      break;
    case 'webhook.test':
      console.log(`[webhook.test] ${data.message}`);
      break;
    default:
      console.log(`[unhandled] ${event}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.BREAKCOLD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BREAKCOLD_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, whatever the Content-Type. Never request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const timestamp = request.headers.get('x-webhook-timestamp');

  // 1. VERIFY against the raw bytes.
  if (!verifyBreakcoldSignature(rawBody, request.headers.get('x-webhook-signature'), timestamp, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Opt-in replay window (off by default; see .env.example).
  const tolerance = Number(process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS);
  if (!isTimestampFresh(timestamp as string, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // 2. PARSE only after verification.
  let payload: BreakcoldEvent;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. DEDUPE.
  const deliveryId = request.headers.get('x-webhook-delivery-id') ?? payload.eventId;
  if (deliveryId) {
    if (processedDeliveries.has(deliveryId)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    processedDeliveries.add(deliveryId);
  }

  // 4. Handle, then acknowledge with any 2xx (Breakcold times out after 10s).
  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Breakcold webhook:', err);
  }
  return NextResponse.json({ received: true });
}
