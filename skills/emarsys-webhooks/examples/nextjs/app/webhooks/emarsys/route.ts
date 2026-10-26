// Generated with: emarsys-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyEmarsysRequest } from '../../../lib/verify-emarsys';

// Demo only: use a durable store (database, Redis) in production.
const seenDeduplicationIds = new Set<string>();

/**
 * The body is whatever the Webhook node preset defines, so this shape is ILLUSTRATIVE:
 * contact field values and "Additional data" at the top level, optional event_data with the
 * triggering event's attributes, and operational fields (deduplication_id, ems_program_id,
 * event_time) that can be renamed in the preset.
 */
interface EmarsysPayload {
  deduplication_id?: string | number;
  ems_program_id?: string | number;
  event_time?: string;
  event_data?: Record<string, unknown>;
  [key: string]: unknown;
}

function handlePayload(payload: EmarsysPayload): void {
  const { event_data: eventData, ems_program_id: programId, event_time: eventTime } = payload;

  if (eventData && typeof eventData === 'object') {
    console.log(`Webhook node call with event_data (program ${programId}, at ${eventTime})`);
    // TODO: act on the triggering event's attributes in payload.event_data
  } else {
    console.log(`Webhook node contact payload (program ${programId}, at ${eventTime})`);
    // TODO: act on the contact field values and Additional data at the top level
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyEmarsysRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  // 406 tells Emarsys to discard this contact and keep the program running. Any other
  // failure is retried (30 s growing to 10 min) and the program enters Fail-safe mode
  // after the 11th failure, so use 406 for bodies that can never be processed.
  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 406 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 406 });
  }

  const body = payload as EmarsysPayload;

  // Idempotency: deduplication_id (when present) identifies a delivery.
  const dedupId = body.deduplication_id !== undefined ? String(body.deduplication_id) : undefined;
  if (dedupId !== undefined && seenDeduplicationIds.has(dedupId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handlePayload(body);
  } catch (err) {
    console.error('Error handling Emarsys webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (dedupId !== undefined) seenDeduplicationIds.add(dedupId);
  return NextResponse.json({ received: true });
}
