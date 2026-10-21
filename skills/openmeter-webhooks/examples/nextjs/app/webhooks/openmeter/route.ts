// Generated with: openmeter-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook, WebhookVerificationError } from 'svix';

export const dynamic = 'force-dynamic';

// OpenMeter notification envelope
type OpenMeterEvent = {
  id: string;
  timestamp: string;
  type: string;
  data: Record<string, any>;
};

export async function POST(request: Request) {
  const secret = process.env.OPENMETER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OPENMETER_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix-id, svix-timestamp or svix-signature header' },
      { status: 400 }
    );
  }

  // Read the RAW body - the signature covers these exact bytes
  const payload = await request.text();

  // Verify with the svix SDK: HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw body}",
  // keyed with the base64-decoded secret, plus a 5-minute timestamp tolerance.
  try {
    new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.error('OpenMeter webhook verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    console.error('Unexpected verification error:', err);
    return NextResponse.json({ error: 'Verification error' }, { status: 500 });
  }

  // Verified - now it is safe to parse
  let event: OpenMeterEvent;
  try {
    event = JSON.parse(payload) as OpenMeterEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const data = event.data ?? {};
  switch (event.type) {
    case 'entitlements.balance.threshold':
      console.log('Entitlement threshold reached:', {
        subject: data.subject?.key,
        feature: data.feature?.key,
        threshold: data.threshold,
        usage: data.value?.usage,
        hasAccess: data.value?.hasAccess,
      });
      // TODO: notify the customer, or block access at 100%
      break;

    case 'entitlements.reset':
      console.log('Entitlement reset:', { subject: data.subject?.key, feature: data.feature?.key });
      // TODO: clear over-quota flags, restore access
      break;

    case 'invoice.created':
      console.log('Invoice created:', { id: data.id, number: data.number, status: data.status });
      // TODO: sync the invoice to your accounting system
      break;

    case 'invoice.updated':
      console.log('Invoice updated:', { id: data.id, number: data.number, status: data.status });
      // TODO: react to the new invoice state
      break;

    default:
      console.log('Unhandled OpenMeter event type:', event.type);
  }

  // Acknowledge quickly; OpenMeter (via Svix) retries non-2xx responses
  return NextResponse.json({ received: true, id: event.id, type: event.type }, { status: 200 });
}
