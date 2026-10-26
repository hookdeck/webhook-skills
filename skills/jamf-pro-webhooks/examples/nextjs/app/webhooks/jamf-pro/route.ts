// Generated with: jamf-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyJamfProRequest } from '../../../lib/verify-jamf-pro';
import { EVENT_LABELS } from '../../../lib/events';

interface JamfProPayload {
  webhook?: { id?: number; name?: string; webhookEvent?: string; eventTimestamp?: number };
  event?: Record<string, unknown>;
}

function handleEvent(payload: JamfProPayload): void {
  const { webhook = {}, event = {} } = payload;
  const label = webhook.webhookEvent ? EVENT_LABELS[webhook.webhookEvent] : undefined;

  if (!label) {
    console.log(`Unhandled event: ${webhook.webhookEvent}`);
    return;
  }

  // TODO: act on `event` (its shape depends on webhook.webhookEvent), e.g.
  // ComputerAdded -> event.udid / event.serialNumber / event.jssID
  // MobileDeviceEnrolled -> event.udid / event.serialNumber
  console.log(`${label} (${webhook.webhookEvent}, webhook "${webhook.name}")`, Object.keys(event));
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyJamfProRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  // JSON is assumed. Jamf Pro can also send XML: set the webhook's format to JSON.
  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body (set the Jamf Pro webhook format to JSON)' },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as JamfProPayload);
  } catch (err) {
    console.error('Error handling Jamf Pro event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
