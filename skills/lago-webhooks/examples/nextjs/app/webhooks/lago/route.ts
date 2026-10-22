// Generated with: lago-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyLagoSignature } from '../../../lib/lago';

interface LagoEvent {
  webhook_type: string;
  object_type?: string;
  organization_id?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (any content type)
  const rawBody = await request.text();
  const signature = request.headers.get('x-lago-signature');
  const algorithm = request.headers.get('x-lago-signature-algorithm');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Lago-Signature header' }, { status: 400 });
  }

  // Lago defaults to jwt; this handler only supports hmac
  if (algorithm && algorithm !== 'hmac') {
    return NextResponse.json(
      { error: 'Unsupported signature algorithm: create the Lago endpoint with hmac' },
      { status: 400 }
    );
  }

  if (!verifyLagoSignature(rawBody, signature, process.env.LAGO_HMAC_KEY ?? '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: LagoEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // X-Lago-Unique-Key is the idempotency key: skip keys you have already processed
  const uniqueKey = request.headers.get('x-lago-unique-key');
  const object = (event.object_type ? (event[event.object_type] as Record<string, unknown>) : undefined) ?? {};

  switch (event.webhook_type) {
    case 'invoice.created':
      console.log('Invoice created:', object.lago_id, uniqueKey);
      // TODO: Record receivable, send invoice
      break;

    case 'invoice.payment_status_updated':
      console.log('Invoice payment status:', object.lago_id, object.payment_status);
      // TODO: Mark invoice paid/failed internally
      break;

    case 'subscription.started':
      console.log('Subscription started:', object.external_id ?? object.lago_id);
      // TODO: Provision access
      break;

    case 'subscription.terminated':
      console.log('Subscription terminated:', object.external_id ?? object.lago_id);
      // TODO: Revoke access
      break;

    case 'customer.created':
      console.log('Customer created:', object.external_id ?? object.lago_id);
      // TODO: Sync customer to CRM
      break;

    case 'wallet.depleted_ongoing_balance':
      console.log('Wallet depleted:', object.lago_id);
      // TODO: Prompt a top-up
      break;

    default:
      console.log(`Unhandled event type: ${event.webhook_type}`);
  }

  return NextResponse.json({ received: true });
}
