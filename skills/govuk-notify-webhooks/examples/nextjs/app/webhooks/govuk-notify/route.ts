// Generated with: govuk-notify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNotifyRequest } from '../../../lib/verify-govuk-notify';

type NotifyPayload = Record<string, unknown>;

/** Callbacks have no event field: tell the three kinds apart by shape. */
function classifyCallback(payload: NotifyPayload): string {
  if (typeof payload.status === 'string' && 'notification_type' in payload) return 'delivery_receipt';
  if ('source_number' in payload && 'destination_number' in payload) return 'received_text';
  if ('notification_id' in payload && 'date_sent' in payload) return 'returned_letter';
  return 'unknown';
}

function handleCallback(payload: NotifyPayload): void {
  switch (classifyCallback(payload)) {
    case 'delivery_receipt':
      // status: delivered, permanent-failure, temporary-failure, technical-failure
      console.log(`Delivery receipt ${payload.id}: ${payload.status} (${payload.notification_type})`);
      // TODO: update the notification by payload.reference / payload.id; retry or alert on failures
      break;

    case 'received_text':
      console.log(`Text message from ${payload.source_number}: ${payload.message}`);
      // TODO: route the reply (payload.destination_number, payload.date_received)
      break;

    case 'returned_letter':
      console.log(`Letter returned: ${payload.notification_id}`);
      // TODO: flag the address as bad (payload.reference, payload.template_name)
      break;

    default:
      console.log('Unhandled GOV.UK Notify callback shape');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyNotifyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization bearer token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleCallback(payload as NotifyPayload);
  } catch (err) {
    console.error('Error handling GOV.UK Notify callback:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
