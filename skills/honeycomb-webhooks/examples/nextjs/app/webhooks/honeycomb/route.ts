// Generated with: honeycomb-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classifyAlert, verifyHoneycombRequest } from '../../../lib/verify-honeycomb';

// Read request headers on every call; never cache this route.
export const dynamic = 'force-dynamic';

// Delivery IDs already handled. In-memory for the example: use a shared store (Redis, DB) in production.
const seenDeliveries = new Set<string>();

function handleAlert(payload: Record<string, unknown>): void {
  switch (classifyAlert(payload)) {
    case 'trigger':
      console.log(`Trigger alert: ${payload.name || payload.trigger_id || '(unnamed)'}`);
      // TODO: page on-call or open an incident
      break;

    case 'slo_burn_alert':
      console.log(`SLO burn alert: ${payload.slo_name || payload.name || '(unnamed)'}`);
      // TODO: escalate before the error budget runs out
      break;

    case 'anomaly':
      console.log('Anomaly detection alert');
      // TODO: open an investigation
      break;

    default:
      console.log(`Unrecognised Honeycomb payload (keys: ${Object.keys(payload).join(', ')})`);
  }
}

// Honeycomb's docs don't name the HTTP method, so every method goes through one handler.
async function handle(request: NextRequest) {
  // Check the credential first, for every method, before reading the body.
  if (!verifyHoneycombRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-Honeycomb-Webhook-Token' }, { status: 401 });
  }

  // The delivery ID is stable across retries of the same delivery.
  const deliveryId = request.headers.get('x-honeycomb-webhook-delivery-id');
  if (deliveryId && seenDeliveries.has(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Read as text so any content type is accepted; an empty body is fine.
  const raw = await request.text();
  let payload: Record<string, unknown> | null = null;
  if (raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  }

  try {
    if (payload) handleAlert(payload);
  } catch (err) {
    console.error('Error handling Honeycomb alert:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (deliveryId) seenDeliveries.add(deliveryId);
  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
