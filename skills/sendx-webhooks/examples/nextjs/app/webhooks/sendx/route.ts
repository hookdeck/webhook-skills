// Generated with: sendx-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySendxSignature, getEventType, SENDX_EVENTS } from '../../../lib/sendx';

export async function POST(request: NextRequest) {
  const secret = process.env.SENDX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SENDX_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifySendxSignature(rawBody, request.headers.get('x-sendx-signature'), secret)) {
    console.error('SendX webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const type = getEventType(payload);
  const name = type === null ? undefined : SENDX_EVENTS[type];
  // X-SendX-Webhook-Id identifies a delivery; use it for idempotency since SendX retries
  const deliveryId = request.headers.get('x-sendx-webhook-id');

  if (name) {
    console.log(`SendX event ${name} (type ${type}), delivery ${deliveryId ?? '(no id)'}`);
  } else {
    console.log(`Unhandled SendX event type: ${JSON.stringify((payload as Record<string, unknown>).type)}`);
  }

  return NextResponse.json({ received: true });
}
