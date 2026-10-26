// Generated with: gc-notify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyGcNotifyRequest } from '../../../lib/verify-gc-notify';

interface DeliveryReceipt {
  id?: string;
  reference?: string | null;
  to?: string;
  status?: string;
  status_description?: string;
  provider_response?: string | null;
  created_at?: string;
  completed_at?: string | null;
  sent_at?: string | null;
  notification_type?: 'email' | 'sms';
  health_check?: string;
  [key: string]: unknown;
}

function handleReceipt(payload: DeliveryReceipt): void {
  // GC Notify callbacks have no event field: dispatch on status.
  const { status, id, reference, to, notification_type: type } = payload;

  if (payload.health_check) {
    console.log('GC Notify health check');
    return;
  }

  switch (status) {
    case 'created':
    case 'sending':
    case 'pending':
    case 'sent':
    case 'pending-virus-check':
      console.log(`${type} ${id} in transit (${status}) for ${reference}`);
      break;

    case 'delivered':
      console.log(`${type} ${id} delivered to ${to}`);
      // TODO: mark the message delivered (payload.completed_at)
      break;

    case 'permanent-failure':
      console.log(`${type} ${id} permanently failed: ${payload.status_description}`);
      // TODO: stop sending to this address or number
      break;

    case 'temporary-failure':
      console.log(`${type} ${id} temporarily failed: ${payload.status_description}`);
      // TODO: record it; a later callback may report the final outcome
      break;

    case 'technical-failure':
      console.log(`${type} ${id} technical failure: ${payload.provider_response}`);
      // TODO: alert and consider resending
      break;

    case 'virus-scan-failed':
      console.log(`${type} ${id} attachment failed the virus scan`);
      // TODO: tell the sender their attachment was rejected
      break;

    default:
      console.log(`Unhandled status: ${status}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyGcNotifyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing bearer token' }, { status: 401 });
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

  // Respond within 1 second: keep slow work off this path (queue it).
  try {
    handleReceipt(payload as DeliveryReceipt);
  } catch (err) {
    console.error('Error handling GC Notify callback:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
